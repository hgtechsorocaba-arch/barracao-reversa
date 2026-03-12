const token = "EAAUOPQy54MgBQ8qQa1G3AYVc2F3qmwk7Qjco5lZABBKBXDzsNSxAsZAfM2lrzHa5UHZCWFY1oOfaF8g0ngZAn2ZAIQGVfAGijZCX1ZCTLG5zMsD7mTeOldBvFyPwj5XHZAYK4iZCPlRCrg6XTdgPOMtMNTZCJkywHZBBEKQ5qJnQjPiiuBwnUrbIAoGyXumwRVe9buneAZDZD";
const phoneId = "1049486521575929";
const to = "5515991659321";

console.log("Iniciando teste de envio (API Oficial)...");

async function runTest() {
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
        console.log("Resultado da Meta:", JSON.stringify(data, null, 2));

        if (response.ok) {
            console.log("SUCESSO! Verifique seu WhatsApp.");
        } else {
            console.log("FALHA. Verifique o erro acima.");
        }
    } catch (err) {
        console.error("Erro na execução:", err);
    }
}

runTest();
