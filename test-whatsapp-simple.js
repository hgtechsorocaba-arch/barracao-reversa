const token = "EAAUOPQy54MgBQwkbtBZCWKgstM8IZAYKPo09c5yykSJVt0XoKMv3ytDij4O2kUv9ZC21PCxq8GqH74PihBfmE5fya99uN6D6ckHDJww1Q3WvaahnwM5BnrtJZA0ZBUa2vrP52aoYyhVdVYZARg5ct1c22H34fcDQdLTBNgAmBUetoB8pEuHjTPpnRiJgT0ZAcUl";
const phoneId = "1049486521575929";
const to = "5515988136215"; // Usando o n\u00famero que o usu\u00e1rio usou no print

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
                    language: { code: 'pt_BR' },
                    components: [
                        {
                            type: 'header',
                            parameters: [{ type: 'image', image: { link: 'https://wsrv.nl/?url=' + encodeURIComponent('https://hwmdwlpmutuhrlcgssqw.supabase.co/storage/v1/object/public/public-assets/1773105446123_2k1cav.jpg') + '&output=jpg' } }]
                        },
                        {
                            type: 'body',
                            parameters: [
                                { type: 'text', text: 'Máquina De Café Em Capsulas Delta Q Mini Qool' },
                                { type: 'text', text: '199,00' }
                            ]
                        },
                        {
                            type: 'button',
                            sub_type: 'url',
                            index: '0',
                            parameters: [{ type: 'text', text: 'mmkrtfjf' }]
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
