require('dotenv').config({ path: '.env.local' });

async function testWhatsApp() {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;
    const to = "5515996965956"; // Substitua pelo seu número se necessário

    console.log("Iniciando teste de envio...");
    console.log("Phone ID:", phoneId);

    try {
        const response = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: to,
                type: 'template',
                template: {
                    name: 'hello_world',
                    language: {
                        code: 'en_US'
                    }
                }
            }),
        });

        const data = await response.json();
        if (response.ok) {
            console.log("Sucesso! Mensagem enviada:", data);
        } else {
            console.error("Erro na API:", data);
        }
    } catch (error) {
        console.error("Erro no servidor:", error);
    }
}

testWhatsApp();
