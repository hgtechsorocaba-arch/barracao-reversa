export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { phone, productName, productPrice, productUrl, productImage, templateName: overrideTemplate } = req.body;

    // Validation
    if (!phone || (!productName && !overrideTemplate)) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const zapLinkSecret = process.env.ZAPLINK_EXTERNAL_SECRET || 'hgtech_bot_secret_123';
    const instancePhone = process.env.ZAPLINK_INSTANCE_PHONE;

    if (!instancePhone) {
        return res.status(500).json({ error: 'ZapLink instance phone not configured in Vercel environment' });
    }

    // Formata a mensagem de texto para o ZapLink
    let message = '';
    if (overrideTemplate === 'hello_world') {
        message = `🧪 *Teste de Conexão (ZapLink / Baileys)*\n\nParabéns! Sua integração do WhatsApp via ZapLink está configurada e funcionando corretamente no Barracão Reversa.`;
    } else {
        const priceFormatted = productPrice ? productPrice.replace('R$', '').trim() : '0,00';
        message = `👋 *Olá!*\n\nOlha só este produto excelente que temos no Barracão Reversa:\n\n` +
            `*${productName}*\n` +
            `💵 *Preço:* R$ ${priceFormatted}\n\n` +
            `🛍️ *Para comprar ou ver mais detalhes, clique no link abaixo:*\n` +
            `👉 ${productUrl}`;
            
        if (productImage) {
            message += `\n\n🖼️ *Foto do produto:* ${productImage}`;
        }
    }

    try {
        console.log(`Enviando mensagem via ZapLink para o número ${phone}...`);
        
        const response = await fetch('https://zaplink.app.br/api/external/send-message', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                secret: zapLinkSecret,
                message: message,
                groupId: phone,
                instancePhone: instancePhone
            })
        });

        const data = await response.json();
        console.log('ZapLink Response for', phone, ':', JSON.stringify(data));

        if (!response.ok) {
            console.error('ZapLink API Error Detail:', JSON.stringify(data, null, 2));
            return res.status(response.status).json({ 
                error: data.error || 'Failed to send message via ZapLink', 
                details: data,
                sentPayload: { to: phone }
            });
        }

        return res.status(200).json({ success: true, zapLinkResponse: data });
    } catch (error) {
        console.error('Server Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
}
