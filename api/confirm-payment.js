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

    const zapLinkSecret = process.env.ZAPLINK_EXTERNAL_SECRET || 'hgtech_bot_secret_123';
    const notifyPhone = process.env.NOTIFY_PHONE || 'notify'; // Destinatário padrão ou 'notify' para roteamento pelo ZapLink
    const instancePhone = process.env.ZAPLINK_INSTANCE_PHONE || '5515996966956'; // Número da instância do Everton

    const supabaseUrl = 'https://hwmdwlpmutuhrlcgssqw.supabase.co';
    const supabaseKey = 'sb_publishable_lo4UybgUFxCbAKVbT-Pkzw_8JEipiqT';

    // 1. Detectar se é Webhook do Pagar.me (Stone)
    const eventType = req.body.event || req.body.type;
    const isPagarMe = !!(eventType && (
        eventType.startsWith('order.') || 
        eventType.startsWith('charge.') || 
        eventType.startsWith('subscription.') ||
        (req.body.data && req.body.data.id && req.body.data.id.startsWith('or_'))
    ));

    if (isPagarMe) {
        console.log(`Recebido webhook do Pagar.me. Evento: ${eventType}`);
        
        if (eventType !== 'order.paid') {
            console.log(`Ignorando evento Pagar.me irrelevante: ${eventType}`);
            return res.status(200).json({ success: true, message: `Evento ${eventType} ignorado.` });
        }

        const order = req.body.data;
        if (!order || order.status !== 'paid') {
            console.log(`Pedido Pagar.me não está pago ou dados ausentes.`);
            return res.status(200).json({ success: true, message: 'Pedido não está pago, ignorando.' });
        }

        const paymentId = order.id;

        try {
            // Deduplicação atômica: tenta inserir o pagamento como processado.
            const wasInserted = await tryMarkPaymentAsProcessed(paymentId, supabaseUrl, supabaseKey);
            if (!wasInserted) {
                console.log(`Pagamento Pagar.me ${paymentId} já processado anteriormente. Ignorando.`);
                return res.status(200).json({ 
                    success: true, 
                    message: 'Payment already processed and notified' 
                });
            }
            console.log(`Pagamento Pagar.me ${paymentId} marcado como processado (primeira vez).`);

            // Marcar também o ID do link de pagamento para que o frontend possa consultar
            const paymentLinkId = order.metadata?.payment_link_id || order.integration?.code || order.code;
            if (paymentLinkId) {
                console.log(`Marcando link de pagamento ${paymentLinkId} como processado.`);
                await tryMarkPaymentAsProcessed(paymentLinkId, supabaseUrl, supabaseKey);
            }

            // Extrair informações do pagamento
            const metadata = order.metadata || {};
            const item = order.items?.[0] || {};
            const title = item.description || item.name || 'Produto';
            const price = (order.amount || 0) / 100; // converter centavos para reais
            const quantity = parseInt(metadata.quantidade || item.quantity || 1, 10);
            
            // Dar baixa no estoque do produto no Supabase
            const productId = metadata.produto_id || item.code || item.reference_id || item.id;
            if (productId && productId !== 'avulso' && productId !== 'produto') {
                try {
                    await decrementProductStock(productId, quantity, supabaseUrl, supabaseKey);
                } catch (err) {
                    console.error(`Error decrementing stock for product ${productId}:`, err);
                }
            }
            
            let name = metadata.cliente_nome || order.customer?.name || 'Não informado';
            let phone = metadata.telefone || 'Não informado';
            if (phone === 'Não informado' && order.customer?.phones?.mobile_phone) {
                const mp = order.customer.phones.mobile_phone;
                phone = mp.area_code ? `(${mp.area_code}) ${mp.number}` : mp.number;
            }
            let email = order.customer?.email || 'Não informado';

            const unitPrice = parseFloat(metadata.valor_unitario || (price / quantity) || 0);

            // Montar a mensagem de notificação para o Everton
            const message = `🔔 *NOVA COMPRA APROVADA!* 🔔\n\n` +
                `*Produto:* ${title}\n` +
                `*Quantidade:* ${quantity} un.\n` +
                `*Preço Unitário:* R$ ${unitPrice.toFixed(2).replace('.', ',')}\n` +
                `*Valor Total:* R$ ${parseFloat(price).toFixed(2).replace('.', ',')}\n` +
                `*Cliente:* ${name.trim()}\n` +
                `*Telefone:* ${phone}\n` +
                `*E-mail:* ${email}\n` +
                `*ID do Pagamento:* ${paymentId}\n` +
                `*Referência:* ${order.code || 'Nenhuma'}\n\n` +
                `Aprovado automaticamente via Pagar.me!`;

            // Enviar mensagem via ZapLink
            console.log(`Enviando mensagem via ZapLink para o destino ${notifyPhone}...`);
            const zapLinkResponse = await sendZapLinkMessage(notifyPhone, message, zapLinkSecret, instancePhone);

            return res.status(200).json({ 
                success: true, 
                message: 'Pagar.me payment verified and notification sent', 
                zapLinkResponse 
            });

        } catch (err) {
            console.error('Error confirming Pagar.me payment:', err);
            return res.status(500).json({ error: 'Error processing Pagar.me payment confirmation', details: err.message });
        }
    }

    // 2. Se for Webhook do Mercado Pago (formato contendo data.id ou id direto)
    let paymentId = req.body.paymentId;
    let externalRef = req.body.externalRef;

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
    if (!mpToken) {
        return res.status(500).json({ error: 'MP_ACCESS_TOKEN not configured' });
    }

    try {
        // Consultar status do pagamento no Mercado Pago
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

        // Deduplicação atômica: tenta inserir o pagamento como processado.
        const wasInserted = await tryMarkPaymentAsProcessed(paymentId, supabaseUrl, supabaseKey);
        if (!wasInserted) {
            console.log(`Pagamento ${paymentId} já foi processado e notificado anteriormente. Ignorando.`);
            return res.status(200).json({ 
                success: true, 
                message: 'Payment already processed and notified' 
            });
        }
        console.log(`Pagamento ${paymentId} marcado como processado (primeira vez).`);

        // Marcar também a referência externa como processada para o frontend poder consultar
        const extRef = payment.external_reference || externalRef;
        if (extRef) {
            console.log(`Marcando também a referência externa ${extRef} como processada.`);
            await tryMarkPaymentAsProcessed(extRef, supabaseUrl, supabaseKey);
        }

        // Extrair informações do pagamento
        const item = payment.additional_info?.items?.[0] || {};
        const title = item.title || 'Produto';
        const price = payment.transaction_amount || 0;
        const metadata = payment.metadata || {};
        const payer = payment.payer || {};
        const additionalPayer = payment.additional_info?.payer || {};

        // Dar baixa no estoque do produto no Supabase
        const productId = metadata.produto_id || item.id;
        const quantity = parseInt(metadata.quantidade || item.quantity || 1, 10);
        if (productId && productId !== 'avulso' && productId !== 'produto') {
            try {
                await decrementProductStock(productId, quantity, supabaseUrl, supabaseKey);
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

        // Montar a mensagem de notificação para o Everton
        const unitPrice = parseFloat(metadata.valor_unitario || item.unit_price || (price / quantity) || 0);
        const message = `🔔 *NOVA COMPRA APROVADA!* 🔔\n\n` +
            `*Produto:* ${title}\n` +
            `*Quantidade:* ${quantity} un.\n` +
            `*Preço Unitário:* R$ ${unitPrice.toFixed(2).replace('.', ',')}\n` +
            `*Valor Total:* R$ ${parseFloat(price).toFixed(2).replace('.', ',')}\n` +
            `*Cliente:* ${name.trim()}\n` +
            `*Telefone:* ${phone}\n` +
            `*E-mail:* ${payer.email || 'Não informado'}\n` +
            `*ID do Pagamento:* ${paymentId}\n` +
            `*Referência:* ${payment.external_reference || externalRef || 'Nenhuma'}\n\n` +
            `Aprovado automaticamente via Mercado Pago!`;

        // Enviar mensagem via ZapLink
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
            groupId: phone,
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

// Deduplicação atômica
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
                'Prefer': 'resolution=ignore-duplicates,return=representation'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (Array.isArray(result) && result.length > 0) {
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                } catch {
                    resolve(true);
                }
            });
        });

        req.on('error', (err) => {
            console.error('Erro ao tentar marcar pagamento como processado:', err);
            resolve(true);
        });

        req.write(payload);
        req.end();
    });
}

// Dar baixa no estoque
async function decrementProductStock(productId, quantity, supabaseUrl, supabaseKey) {
    if (!productId || productId === 'avulso' || productId === 'produto') return;

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
    const newStock = Math.max(0, currentStock - quantity);
    console.log(`Atualizando estoque do produto ${productId}: ${currentStock} -> ${newStock}`);

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
