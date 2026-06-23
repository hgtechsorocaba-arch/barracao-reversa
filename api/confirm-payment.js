const https = require('https');

module.exports = async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        res.setHeader('Allow', ['POST']);
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    let paymentId = req.body.paymentId;
    let externalRef = req.body.externalRef;

    // Se for Webhook do Mercado Pago (formato contendo data.id ou id direto)
    if (!paymentId && req.body.data && req.body.data.id) {
        paymentId = req.body.data.id;
    } else if (!paymentId && req.body.id && (req.body.type === 'payment' || req.body.action?.startsWith('payment.'))) {
        paymentId = req.body.id;
    } else if (!paymentId && req.body.topic === 'payment' && req.body.resource) {
        paymentId = req.body.resource.split('/').pop();
    }

    if (!paymentId) {
        console.log('Webhook recebido sem ID de pagamento relevante:', req.body);
        return res.status(200).json({ success: true, message: 'Webhook received but ignored (no payment ID found)' });
    }

    const mpToken = process.env.MP_ACCESS_TOKEN;
    const zapLinkSecret = process.env.ZAPLINK_EXTERNAL_SECRET || 'hgtech_bot_secret_123';
    const notifyPhone = process.env.NOTIFY_PHONE || '5515996966956'; // Número do Everton ou JID do Grupo
    const instancePhone = process.env.ZAPLINK_INSTANCE_PHONE || '5515996966956'; // Número da instância do Everton

    if (!mpToken) {
        return res.status(500).json({ error: 'MP_ACCESS_TOKEN not configured' });
    }

    try {
        // 1. Consultar status do pagamento no Mercado Pago
        console.log(`Verificando pagamento ${paymentId} no Mercado Pago...`);
        const payment = await getMercadoPagoPayment(paymentId, mpToken);

        if (!payment || payment.status !== 'approved') {
            console.log(`Pagamento ${paymentId} não está aprovado (status: ${payment ? payment.status : 'unknown'}). Retornando 200.`);
            return res.status(200).json({ 
                success: true, 
                message: 'Payment not approved, ignoring event', 
                status: payment ? payment.status : 'unknown' 
            });
        }

        const supabaseUrl = 'https://hwmdwlpmutuhrlcgssqw.supabase.co';
        const supabaseKey = 'sb_publishable_lo4UybgUFxCbAKVbT-Pkzw_8JEipiqT';

        // Deduplicação atômica: tenta inserir o pagamento como processado.
        // Se já existir (UNIQUE constraint), o UPSERT retorna 0 linhas → significa que já foi processado.
        // Isso evita a race condition do antigo check-then-insert.
        const wasInserted = await tryMarkPaymentAsProcessed(paymentId, supabaseUrl, supabaseKey);
        if (!wasInserted) {
            console.log(`Pagamento ${paymentId} já foi processado e notificado anteriormente. Ignorando.`);
            return res.status(200).json({ 
                success: true, 
                message: 'Payment already processed and notified' 
            });
        }
        console.log(`Pagamento ${paymentId} marcado como processado (primeira vez).`);

        // 2. Extrair informações do pagamento
        const item = payment.additional_info?.items?.[0] || {};
        const title = item.title || 'Produto';
        const price = payment.transaction_amount || 0;
        const metadata = payment.metadata || {};
        const payer = payment.payer || {};
        const additionalPayer = payment.additional_info?.payer || {};

        // Dar baixa no estoque do produto no Supabase
        const productId = metadata.produto_id || item.id;
        if (productId && productId !== 'avulso' && productId !== 'produto') {
            try {
                await decrementProductStock(productId, supabaseUrl, supabaseKey);
            } catch (err) {
                console.error(`Error decrementing stock for product ${productId}:`, err);
            }
        }
        
        let name = metadata.cliente_nome || '';
        if (!name.trim()) {
            name = (additionalPayer.first_name || '') + ' ' + (additionalPayer.last_name || '');
        }
        if (!name.trim()) {
            name = (payer.first_name || '') + ' ' + (payer.last_name || '');
        }
        name = name.trim() || 'Não informado';

        let phone = metadata.telefone || '';
        if (!phone.trim()) {
            const pPhone = payment.additional_info?.payer?.phone || payment.payer?.phone || {};
            if (pPhone.number) {
                phone = (pPhone.area_code ? `(${pPhone.area_code}) ` : '') + pPhone.number;
            }
        }
        phone = phone.trim() || 'Não informado';

        // 3. Montar a mensagem de notificação para o Everton
        const message = `🔔 *NOVA COMPRA APROVADA!* 🔔\n\n` +
            `*Produto:* ${title}\n` +
            `*Valor:* R$ ${parseFloat(price).toFixed(2).replace('.', ',')}\n` +
            `*Cliente:* ${name.trim()}\n` +
            `*Telefone:* ${phone}\n` +
            `*E-mail:* ${payer.email || 'Não informado'}\n` +
            `*ID do Pagamento:* ${paymentId}\n` +
            `*Referência:* ${payment.external_reference || externalRef || 'Nenhuma'}\n\n` +
            `Aprovado automaticamente via Mercado Pago!`;

        // 4. Enviar mensagem via ZapLink
        console.log(`Enviando mensagem via ZapLink para o destino ${notifyPhone}...`);
        const zapLinkResponse = await sendZapLinkMessage(notifyPhone, message, zapLinkSecret, instancePhone);

        return res.status(200).json({ 
            success: true, 
            message: 'Payment verified and notification sent', 
            zapLinkResponse 
        });

    } catch (err) {
        console.error('Error confirming payment:', err);
        return res.status(500).json({ error: 'Error processing payment confirmation', details: err.message });
    }
};

// Consultar o pagamento no Mercado Pago
function getMercadoPagoPayment(paymentId, accessToken) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.mercadopago.com',
            port: 443,
            path: `/v1/payments/${paymentId}`,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        };

        const request = https.request(options, (response) => {
            let data = '';
            response.on('data', (chunk) => data += chunk);
            response.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    resolve(null);
                }
            });
        });

        request.on('error', reject);
        request.end();
    });
}

// Disparar mensagem via API ZapLink
function sendZapLinkMessage(phone, message, secret, instancePhone) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            secret: secret,
            message: message,
            groupId: phone, // O endpoint 'send-message' do ZapLink recebe o número no parâmetro 'groupId'
            instancePhone: instancePhone
        });

        const options = {
            hostname: 'zaplink.app.br',
            port: 443,
            path: '/api/external/send-message',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            },
        };

        const request = https.request(options, (response) => {
            let data = '';
            response.on('data', (chunk) => data += chunk);
            response.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    resolve({ raw: data });
                }
            });
        });

        request.on('error', reject);
        request.write(payload);
        request.end();
    });
}

// Deduplicação atômica: tenta inserir o payment_id no Supabase.
// Usa o header 'Prefer: resolution=ignore-duplicates' do PostgREST para que,
// se o registro já existir (UNIQUE/PK constraint), a operação retorne 200 sem inserir.
// Retorna true se inseriu (primeira vez), false se já existia (duplicata).
function tryMarkPaymentAsProcessed(paymentId, supabaseUrl, supabaseKey) {
    return new Promise((resolve) => {
        const payload = JSON.stringify({ payment_id: String(paymentId) });
        const urlObj = new URL(`${supabaseUrl}/rest/v1/processed_payments`);
        
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname,
            method: 'POST',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
                // ignore-duplicates: se o payment_id já existe, retorna 200 sem inserir
                // return=representation: retorna as linhas efetivamente inseridas
                'Prefer': 'resolution=ignore-duplicates,return=representation'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    // Se retornou um array com 1+ item, significa que inseriu (primeira vez)
                    // Se retornou array vazio, significa que já existia (duplicata ignorada)
                    if (Array.isArray(result) && result.length > 0) {
                        resolve(true); // Primeira vez — prosseguir com notificação
                    } else {
                        resolve(false); // Já existia — duplicata
                    }
                } catch {
                    // Se não conseguiu parsear, assume que é a primeira vez para não perder a notificação
                    console.error('Erro ao parsear resposta do UPSERT de deduplicação:', data);
                    resolve(true);
                }
            });
        });

        req.on('error', (err) => {
            console.error('Erro ao tentar marcar pagamento como processado:', err);
            // Em caso de erro de rede, permite prosseguir para não perder notificação
            resolve(true);
        });

        req.write(payload);
        req.end();
    });
}

// Dar baixa no estoque (decrementar por 1) no Supabase
async function decrementProductStock(productId, supabaseUrl, supabaseKey) {
    if (!productId || productId === 'avulso' || productId === 'produto') return;

    // 1. Buscar o estoque atual
    const product = await new Promise((resolve) => {
        const url = `${supabaseUrl}/rest/v1/products?id=eq.${encodeURIComponent(productId)}&select=stock`;
        const options = {
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
            }
        };

        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (Array.isArray(result) && result.length > 0) {
                        resolve(result[0]);
                    } else {
                        resolve(null);
                    }
                } catch {
                    resolve(null);
                }
            });
        }).on('error', (err) => {
            console.error('Error fetching product stock:', err);
            resolve(null);
        });
    });

    if (!product || typeof product.stock === 'undefined') {
        console.log(`Produto ${productId} não encontrado ou campo de estoque indefinido.`);
        return;
    }

    const currentStock = parseInt(product.stock) || 0;
    const newStock = Math.max(0, currentStock - 1);
    console.log(`Atualizando estoque do produto ${productId}: ${currentStock} -> ${newStock}`);

    // 2. Fazer PATCH para atualizar o estoque
    await new Promise((resolve) => {
        const payload = JSON.stringify({ stock: newStock });
        const urlObj = new URL(`${supabaseUrl}/rest/v1/products?id=eq.${encodeURIComponent(productId)}`);
        
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'PATCH',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = https.request(options, (res) => {
            res.on('data', () => {});
            res.on('end', () => {
                console.log(`Status da atualização de estoque no Supabase: ${res.statusCode}`);
                resolve(res.statusCode === 204 || res.statusCode === 200);
            });
        });

        req.on('error', (err) => {
            console.error('Error sending stock update request:', err);
            resolve(false);
        });

        req.write(payload);
        req.end();
    });
}
