// api/sales-report.js — Vercel Serverless Function
// Retorna o histórico de vendas (pagamentos) do Mercado Pago
const https = require('https');

module.exports = async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    const { password } = req.query;
    const adminPassword = process.env.ADMIN_PASSWORD || 'Everton2023@';

    if (password !== adminPassword) {
        return res.status(401).json({ error: 'Não autorizado. Senha inválida.' });
    }

    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
        return res.status(500).json({ error: 'MP_ACCESS_TOKEN não configurado no servidor' });
    }

    try {
        // Query payments from Mercado Pago Search API
        // limit=100, ordenado por data de criação decrescente
        const mpPath = '/v1/payments/search?sort=date_created&criteria=desc&limit=100';
        
        console.log('Buscando pagamentos no Mercado Pago...');
        const mpResponse = await callMercadoPago(mpPath, 'GET', accessToken);

        if (!mpResponse || !mpResponse.results) {
            console.error('Erro na resposta do MP:', mpResponse);
            return res.status(502).json({ error: 'Erro ao buscar dados no Mercado Pago', details: mpResponse });
        }

        // Filtrar para trazer apenas vendas originadas no site do Barracão (referência começando com BR-)
        const sitePayments = mpResponse.results.filter(payment => 
            payment.external_reference && 
            String(payment.external_reference).toUpperCase().startsWith('BR-')
        );

        // Formatar os resultados para simplificar no frontend
        const sales = sitePayments.map(payment => {
            const item = payment.additional_info?.items?.[0] || {};
            const title = item.title || payment.description || 'Produto';
            
            let name = payment.metadata?.cliente_nome || '';
            if (!name.trim()) {
                const addPayer = payment.additional_info?.payer || {};
                name = (addPayer.first_name || '') + ' ' + (addPayer.last_name || '');
            }
            if (!name.trim() && payment.payer) {
                name = (payment.payer.first_name || '') + ' ' + (payment.payer.last_name || '');
            }
            name = name.trim() || 'Não informado';

            let phone = payment.metadata?.telefone || '';
            if (!phone.trim()) {
                const pPhone = payment.additional_info?.payer?.phone || payment.payer?.phone || {};
                if (pPhone.number) {
                    phone = (pPhone.area_code ? `(${pPhone.area_code}) ` : '') + pPhone.number;
                }
            }
            phone = phone.trim() || 'Não informado';

            return {
                id: payment.id,
                date: payment.date_created,
                status: payment.status,
                statusDetail: payment.status_detail,
                amount: payment.transaction_amount || 0,
                paymentMethod: payment.payment_method_id || 'unknown',
                reference: payment.external_reference || 'Nenhuma',
                productName: title,
                customerName: name,
                customerPhone: phone,
                customerEmail: payment.payer?.email || 'Não informado',
                deliveryInfo: payment.metadata?.entrega || 'Não informado'
            };
        });

        return res.status(200).json({ success: true, sales });

    } catch (err) {
        console.error('Erro ao gerar relatório de vendas:', err);
        return res.status(500).json({ error: 'Erro interno no servidor', details: err.message });
    }
};

function callMercadoPago(path, method, accessToken) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'api.mercadopago.com',
            port: 443,
            path,
            method,
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
        };

        const request = https.request(options, (response) => {
            let responseData = '';
            response.on('data', (chunk) => responseData += chunk);
            response.on('end', () => {
                try {
                    resolve(JSON.parse(responseData));
                } catch {
                    resolve({ raw: responseData });
                }
            });
        });

        request.on('error', reject);
        request.end();
    });
}
