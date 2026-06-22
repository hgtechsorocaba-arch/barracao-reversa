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

        // Evitar duplicidade (Deduplicação)
        const alreadyProcessed = await isPaymentAlreadyProcessed(paymentId, supabaseUrl, supabaseKey);
        if (alreadyProcessed) {
            console.log(`Pagamento ${paymentId} já foi processado e notificado anteriormente. Ignorando.`);
            return res.status(200).json({ 
                success: true, 
                message: 'Payment already processed and notified' 
            });
        }

        // Marcar como processado antes de enviar para evitar condições de corrida (race conditions)
        await markPaymentAsProcessed(paymentId, supabaseUrl, supabaseKey);

        // 2. Extrair informações do pagamento
        const item = payment.additional_info?.items?.[0] || {};
        const title = item.title || 'Produto';
        const price = payment.transaction_amount || 0;
        const metadata = payment.metadata || {};
        const payer = payment.payer || {};
        const additionalPayer = payment.additional_info?.payer || {};
        
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

// Verificar se o pagamento já foi processado no Supabase
function isPaymentAlreadyProcessed(paymentId, supabaseUrl, supabaseKey) {
    return new Promise((resolve) => {
        const urlObj = new URL(`${supabaseUrl}/rest/v1/processed_payments?payment_id=eq.${encodeURIComponent(paymentId)}&select=payment_id`);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (Array.isArray(result) && result.length > 0) {
                        resolve(true); // Já processado
                    } else {
                        resolve(false);
                    }
                } catch {
                    resolve(false);
                }
            });
        });

        req.on('error', (err) => {
            console.error('Error checking processed payment:', err);
            resolve(false);
        });
        req.end();
    });
}

// Salvar no Supabase que o pagamento foi processado
function markPaymentAsProcessed(paymentId, supabaseUrl, supabaseKey) {
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
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const req = https.request(options, (res) => {
            res.on('data', () => {});
            res.on('end', () => {
                resolve(res.statusCode === 201);
            });
        });

        req.on('error', (err) => {
            console.error('Error marking payment as processed:', err);
            resolve(false);
        });

        req.write(payload);
        req.end();
    });
}
