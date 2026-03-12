export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { phone, productName, productPrice, productUrl, productImage } = req.body;

    // Validation
    if (!phone || !productName || !productPrice || !productUrl) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'anuncio_venda_oficial';

    if (!token || !phoneId) {
        return res.status(500).json({ error: 'WhatsApp API credentials not configured in Vercel environment' });
    }

    try {
        const response = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: phone,
                type: 'template',
                template: {
                    name: templateName,
                    language: {
                        code: 'pt_BR'
                    },
                    components: [
                        {
                            type: 'header',
                            parameters: [
                                {
                                    type: 'image',
                                    image: {
                                        // A Meta NÃO suporta WebP em templates. O proxy wsrv.nl força a conversão para JPG.
                                        link: `https://wsrv.nl/?url=${encodeURIComponent(productImage)}&output=jpg`
                                    }
                                }
                            ]
                        },
                        {
                            type: 'body',
                            parameters: [
                                { type: 'text', text: productName },
                                { type: 'text', text: productPrice }
                            ]
                        },
                        {
                            type: 'button',
                            sub_type: 'url',
                            index: '0',
                            parameters: [
                                {
                                    type: 'text',
                                    text: productUrl.split('id=').pop() || '' // Envia apenas o ID para a URL dinâmica do botão
                                }
                            ]
                        }
                    ]
                }
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('WhatsApp API Error:', JSON.stringify(data, null, 2));
            console.error('Payload Sent:', JSON.stringify(req.body, null, 2));
            return res.status(response.status).json({ error: data.error?.message || 'Failed to send message', details: data });
        }

        return res.status(200).json({ success: true, data });
    } catch (error) {
        console.error('Server Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
}
