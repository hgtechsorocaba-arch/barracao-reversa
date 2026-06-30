const https = require('https');

module.exports = async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    const { phone, customerName, productName, reference, amount, adminPassword } = req.body;
    
    const serverPassword = process.env.ADMIN_PASSWORD || 'Everton2023@';

    if (adminPassword !== serverPassword) {
        return res.status(401).json({ error: 'Não autorizado. Senha inválida.' });
    }

    if (!phone || !customerName || !productName) {
        return res.status(400).json({ error: 'Faltam dados obrigatórios (telefone, nome ou produto)' });
    }

    const zapLinkSecret = process.env.ZAPLINK_EXTERNAL_SECRET || 'hgtech_bot_secret_123';
    const instancePhone = process.env.ZAPLINK_INSTANCE_PHONE || '5515996966956';

    const firstName = customerName.split(' ')[0];

    // Montando a mensagem
    const message = `Olá *${firstName}*! Aqui é da Barracão Reversa.\n\nVimos que você tentou comprar o produto *${productName}* mas o pedido não foi concluído.\n\nPosso ajudar com alguma dúvida para você garantir o seu?`;

    try {
        console.log(`Enviando mensagem de resgate via ZapLink para o destino ${phone}...`);
        const zapLinkResponse = await sendZapLinkMessage(phone, message, zapLinkSecret, instancePhone);

        if (zapLinkResponse && zapLinkResponse.success) {
            return res.status(200).json({ success: true, message: 'Enviado com sucesso' });
        } else {
            console.error('Falha no envio ZapLink:', zapLinkResponse);
            return res.status(500).json({ error: 'Falha na resposta do ZapLink', details: zapLinkResponse });
        }
    } catch (err) {
        console.error('Erro ao enviar resgate via ZapLink:', err);
        return res.status(500).json({ error: 'Erro interno no servidor', details: err.message });
    }
};

// Função idêntica à do confirm-payment.js
function sendZapLinkMessage(phone, message, secret, instancePhone) {
    return new Promise((resolve, reject) => {
        // Limpar o telefone (manter apenas números)
        let cleanPhone = String(phone).replace(/\D/g, '');
        
        // Adicionar o código do país (55) caso seja um número do Brasil sem DDI
        if (cleanPhone.length === 10 || cleanPhone.length === 11) {
            cleanPhone = '55' + cleanPhone;
        }

        const payload = JSON.stringify({
            secret: secret,
            message: message,
            groupId: cleanPhone, // A API do ZapLink usa groupId para telefone (ou ID do chat)
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
