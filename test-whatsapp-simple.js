const token = "EAAUOPQy54MgBQzmYANLYolwbQZCpMLvWarjSOaTtThpQvCAbWvdNOHK19z3m2Bfgslf1o0jmMw4KfhjU6tZAgZBdpZCjrW8jp4TYpn4CxHiQpCYLe5EeflDqtErZBZBUw9ZCMArRrZBQ7GLKELe1v68ru3Ilk63DtkYmGjR9USZANZAr4Kft6k8VdX8IZAI3pDz54Pb19lQkfKe5i7ZAZCqriqAITzMICDZCgwFauA9HjhPVxlo3OVVTduJwI3rZB9D2YsUdZBM8WKDbyfXuNK3pE2BaJ5jjce9u";
const phoneId = "1055020337675079";
const to = "5515988136215";

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
                    name: 'venda_produto_barracao',
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
                                        link: 'https://www.barracaoreversa.com.br/logo.png' // Imagem de teste
                                    }
                                }
                            ]
                        },
                        {
                            type: 'body',
                            parameters: [
                                { type: 'text', text: 'Produto de Teste' },
                                { type: 'text', text: '50,00' }
                            ]
                        },
                        {
                            type: 'button',
                            sub_type: 'url',
                            index: '0',
                            parameters: [
                                {
                                    type: 'text',
                                    text: 'produto-teste'
                                }
                            ]
                        }
                    ]
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
