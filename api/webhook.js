const https = require('https');

const VERIFY_TOKEN = (process.env.WEBHOOK_VERIFY_TOKEN || 'barracao_reversa_2025_token_secreto').trim();

// Credenciais da Meta API
const WHATSAPP_API_URL = (process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v19.0/594382890426533/messages').trim(); // Ajuste o ID do telefone se necessário
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN ? process.env.WHATSAPP_TOKEN.trim() : '';

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
            const statuses = value?.statuses;

            // Se for um aviso de status da entrega (ex: delivered, read, failed)
            if (statuses && statuses.length > 0) {
                console.log("META DELIVERY STATUS UPDATE:", JSON.stringify(statuses, null, 2));
            }

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
            // 1. Se a mensagem veio do botão "Conversar com a empresa", o ID do produto 
            //    pode vir no texto do botão se configuramos assim ou o cliente pode ter mandado texto
            console.log(`Mensagem recebida de ${senderPhone}: "${incomingText}"`);

            // Captura o ID do botão se a pessoa clicou em "Conversar com a empresa".
            // No send-whatsapp.js, o payload do botão era apenas o próprio ID do produto: productUrl.split('id=').pop()
            let productIdFromButton = null;
            if (message.type === 'button') {
                 productIdFromButton = message.button.text;
            } else if (message.type === 'interactive' && message.interactive.type === 'button_reply') {
                 productIdFromButton = message.interactive.button_reply.id || message.interactive.button_reply.title;
            }

            // Faz a verificação no Supabase
            // Passa tanto o texto quanto o possível ID do botão
            const product = await searchProductInSupabase(incomingText, productIdFromButton);

            if (product) {
                // Encontrou! Responder com o link
                console.log(`Produto encontrado: ${product.name}. Enviando resposta.`);
                await sendReplyMessage(senderPhone, product);
            } else {
                console.log(`Nenhum produto encontrado correspondente a: "${incomingText}" ou ID "${productIdFromButton}"`);
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
 * Busca o produto no Supabase usando uma busca textual simples ou ID
 */
async function searchProductInSupabase(searchText, productId = null) {
    if ((!searchText || searchText.length < 3) && !productId) return null;

    let url = '';

    if (productId && productId.length > 5) { // IDs no Supabase costumam ser longos (UUID ou Hash curtos)
         // Busca exata pelo ID
         url = `${supabaseUrl}/rest/v1/products?select=id,name,price,stock,image&id=eq.${encodeURIComponent(productId)}&limit=1`;
    } else {
         // Busca textual por nome
         const palavras = searchText.trim().split(' ').slice(0, 3).join(' ');
         const termoBusca = encodeURIComponent(`*${palavras}*`);
         url = `${supabaseUrl}/rest/v1/products?select=id,name,price,stock,image&name=ilike.${termoBusca}&limit=1`;
    }

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
 * Envia uma mensagem via API ZapLink (Baileys).
 */
async function sendReplyMessage(toPhone, product) {
    const zapLinkSecret = process.env.ZAPLINK_EXTERNAL_SECRET || 'hgtech_bot_secret_123';
    const instancePhone = process.env.ZAPLINK_INSTANCE_PHONE;

    if (!instancePhone) {
        console.error('ZAPLINK_INSTANCE_PHONE não configurado nas variáveis de ambiente.');
        return;
    }

    const priceFormatted = 'R$ ' + parseFloat(product.price).toFixed(2).replace('.', ',');
    const productLink = `https://www.barracaoreversa.com.br/?p=${product.id}`;
    
    // Monta o texto bonitão do robô
    let textMsg = `👋 *Olá!*\n\nVi que você se interessou pelo *${product.name}*!\nEle está disponível por apenas *${priceFormatted}*.\n\n🛍️ *Garanta o seu agora mesmo clicando no link abaixo e finalizando o pedido no nosso site:*\n\n👉 ${productLink}`;

    if (product.image) {
        textMsg += `\n\n🖼️ *Foto do produto:* ${product.image}`;
    }

    const payload = JSON.stringify({
        secret: zapLinkSecret,
        message: textMsg,
        groupId: toPhone,
        instancePhone: instancePhone
    });

    return new Promise((resolve) => {
        const options = {
            hostname: 'zaplink.app.br',
            port: 443,
            path: '/api/external/send-message',
            method: 'POST',
            headers: {
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
                    console.error(`Falha no envio do WhatsApp via ZapLink. Status: ${res.statusCode}. Resposta: ${resData}`);
                    resolve(null);
                }
            });
        });

        req.on('error', (e) => {
            console.error(`Erro ao tentar enviar via ZapLink: ${e}`);
            resolve(null);
        });

        req.write(payload);
        req.end();
    });
}
