const https = require('https');

// Token de verificação para o webhook da Meta (você pode escolher qualquer string, mas tem que bater com o que for colocado no painel da Meta)
// Em produção, isso deve vir de process.env.WEBHOOK_VERIFY_TOKEN
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'barracao_reversa_2025_token_secreto';

// Credenciais da Meta API
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v19.0/594382890426533/messages'; // Ajuste o ID do telefone se necessário
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

// Credenciais Supabase
const supabaseUrl = 'https://hwmdwlpmutuhrlcgssqw.supabase.co';
const supabaseKey = 'sb_publishable_lo4UybgUFxCbAKVbT-Pkzw_8JEipiqT';

module.exports = async function handler(req, res) {
    // ---------------------------------------------------------
    // 1. VALIDAÇÃO DO WEBHOOK (GET)
    // Usado pelo painel da Meta para verificar se a URL é válida
    // ---------------------------------------------------------
    if (req.method === 'GET') {
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        if (mode && token) {
            if (mode === 'subscribe' && token === VERIFY_TOKEN) {
                console.log('WEBHOOK_VERIFIED');
                return res.status(200).send(challenge);
            } else {
                return res.status(403).send('Forbidden');
            }
        }
        return res.status(400).send('Bad Request');
    }

    // ---------------------------------------------------------
    // 2. RECEBIMENTO DE MENSAGENS (POST)
    // Disparado quando alguém manda mensagem para o WhatsApp
    // ---------------------------------------------------------
    if (req.method === 'POST') {
        try {
            const body = req.body;

            // Verifica se é um evento do WhatsApp
            if (body.object !== 'whatsapp_business_account') {
                return res.status(404).send('Not Found');
            }

            // O payload pode conter múltiplas entradas/mudanças
            const entry = body.entry?.[0];
            const changes = entry?.changes?.[0];
            const value = changes?.value;
            const messages = value?.messages;

            // Se não houver mensagem, retorna 200 para a Meta não reenviar
            if (!messages || messages.length === 0) {
                return res.status(200).send('EVENT_RECEIVED');
            }

            const message = messages[0];
            const senderPhone = message.from;

            // Registra a mensagem inteira para debug no console da Vercel
            console.log("PAYLOAD COMPLETO DA MENSAGEM:", JSON.stringify(message));

            if (message.type === 'text') {
                incomingText = message.text.body;
            } else if (message.type === 'button') {
                incomingText = message.button.text;
            } else if (message.type === 'interactive') {
                // Para respostas de botões de templates
                if (message.interactive.type === 'button_reply') {
                    incomingText = message.interactive.button_reply.title;
                }
            } else if (message.type === 'image' && message.image && message.image.caption) {
                // Se o usuário encaminhar a foto do produto com o título
                incomingText = message.image.caption;
            } else if (message.type === 'video' && message.video && message.video.caption) {
                incomingText = message.video.caption;
            } else {
                // Outros tipos de mensagem (áudio, etc) ignoramos por enquanto, mas logamos
                console.log(`Tipo de mensagem ignorada: ${message.type}`);
                 return res.status(200).send('EVENT_RECEIVED');
            }

            // O contexto indica a qual mensagem a pessoa está respondendo
            const contextMatches = message.context && message.context.id;
            
            // LÓGICA DO ROBÔ:
            // Vamos assumir que se a pessoa mandou um texto que "parece" um nome de produto,
            // ou se ela respondeu a uma mensagem que citava o produto, vamos procurar no banco.

            console.log(`Mensagem recebida de ${senderPhone}: "${incomingText}"`);

            // Faz a verificação no Supabase
            const product = await searchProductInSupabase(incomingText);

            if (product) {
                // Encontrou! Responder com o link
                console.log(`Produto encontrado: ${product.name}. Enviando resposta.`);
                await sendReplyMessage(senderPhone, product);
            } else {
                console.log(`Nenhum produto encontrado correspondente a: "${incomingText}"`);
            }

            return res.status(200).send('EVENT_RECEIVED');

        } catch (error) {
            console.error('Erro no webhook POST:', error);
            // Sempre enviar 200 de volta para evitar retries infinitos do Meta em caso de erro interno
            return res.status(200).send('EVENT_RECEIVED_WITH_ERROR');
        }
    }

    // Outros métodos não suportados
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end('Method Not Allowed');
};

// ---------------------------------------------------------
// FUNÇÕES AUXILIARES
// ---------------------------------------------------------

/**
 * Busca o produto no Supabase usando uma busca textual simples.
 */
async function searchProductInSupabase(searchText) {
    if (!searchText || searchText.length < 3) return null;

    // Limpa um pouco o texto recebido para melhorar a busca
    // Se a mensagem diz "Echo Dot (Geração mais recente)", uma busca exata falharia facilmente.
    // Vamos usar a API REST do Supabase com o operador ilike (busca case-insensitive baseada em padrão).
    // Nota: Ilike no REST API Supabase usa formato: col=ilike.*termo*
    
    // Pegar o começo do texto (ex: primeiras 3 palavras) para fazer a busca mais flexível
    const palavras = searchText.trim().split(' ').slice(0, 3).join(' ');
    // Escapar caracteres especiais para a URL
    const termoBusca = encodeURIComponent(`*${palavras}*`);

    const url = `${supabaseUrl}/rest/v1/products?select=id,name,price,stock,image&name=ilike.${termoBusca}&limit=1`;

    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
            }
        };

        https.get(url, options, (resp) => {
            let data = '';
            resp.on('data', (chunk) => data += chunk);
            resp.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result && result.length > 0) {
                        resolve(result[0]); // Retorna o primeiro que der match
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    console.error('Erro no parse do Supabase:', data);
                    resolve(null);
                }
            });
        }).on("error", (err) => {
            console.error("Erro requisição Supabase:", err);
            resolve(null);
        });
    });
}

/**
 * Envia uma mensagem via API Oficial do WhatsApp.
 */
async function sendReplyMessage(toPhone, product) {
    if (!WHATSAPP_TOKEN) {
        console.error('WHATSAPP_TOKEN não configurado nas variáveis de ambiente.');
        return;
    }

    const priceFormatted = 'R$ ' + parseFloat(product.price).toFixed(2).replace('.', ',');
    const productLink = `https://www.barracaoreversa.com.br/?p=${product.id}`;
    
    // Monta o texto bonitão do robô
    const textMsg = `👋 *Olá!*\n\nVi que você se interessou pelo *${product.name}*!\nEle está disponível por apenas *${priceFormatted}*.\n\n🛍️ *Garanta o seu agora mesmo clicando no link abaixo e finalizando o pedido no nosso site:*\n\n👉 ${productLink}`;

    const payload = JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toPhone,
        type: "text",
        text: {
            preview_url: true, // Para gerar o card bonitinho com a foto do site
            body: textMsg
        }
    });

    return new Promise((resolve, reject) => {
        const urlObj = new URL(WHATSAPP_API_URL);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = https.request(options, (res) => {
            let resData = '';
            res.on('data', d => resData += d);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(resData);
                } else {
                    console.error(`Falha no envio do WhatsApp API. Status: ${res.statusCode}. Resposta: ${resData}`);
                    resolve(null); // Resolvendo pra não travar a promise principal
                }
            });
        });

        req.on('error', (e) => {
            console.error(`Erro ao tentar enviar pro WhatsApp: ${e}`);
            resolve(null);
        });

        req.write(payload);
        req.end();
    });
}
