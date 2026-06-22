export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { phone, productName, productPrice, productUrl, productImage, templateName: overrideTemplate } = req.body;

    // Validation
    if (!phone || (!productName && !overrideTemplate)) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;
    const templateName = overrideTemplate || process.env.WHATSAPP_TEMPLATE_NAME || 'venda_produto_barracao';

    if (!token || !phoneId) {
        return res.status(500).json({ error: 'WhatsApp API credentials not configured in Vercel environment' });
    }

    try {
        const response = await fetch(`https://graph.facebook.com/v20.0/${phoneId}/messages`, {
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
                    components: templateName === 'hello_world' ? [] : [
                        {
                            type: 'header',
                            parameters: [
                                {
                                    type: 'image',
                                    image: {
                                        // Tentando link DIRETO do Supabase para evitar bloqueios de proxy
                                        link: productImage && productImage.startsWith('http') 
                                            ? encodeURI(productImage) 
                                            : 'https://hwmdwlpmutuhrlcgssqw.supabase.co/storage/v1/object/public/public-assets/placeholder.jpg'
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
                            index: 0, // Usar número inteiro conforme documentação
                            parameters: [
                                {
                                    type: 'text',
                                    text: productUrl.includes('id=') ? productUrl.split('id=').pop() : productUrl
                                }
                            ]
                        }
                    ]
                }
            }),
        });

        const data = await response.json();
        console.log('WS Meta Response for', phone, ':', JSON.stringify(data));

        if (!response.ok) {
            console.error('WhatsApp API Error Error Detail:', JSON.stringify(data, null, 2));
            return res.status(response.status).json({ 
                error: data.error?.message || 'Failed to send message', 
                details: data,
                sentPayload: { to: phone, template: templateName }
            });
        }

        return res.status(200).json({ success: true, metaResponse: data });
    } catch (error) {
        console.error('Server Error:', error);
        return res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
}
