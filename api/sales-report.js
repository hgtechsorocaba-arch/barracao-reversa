// api/sales-report.js — Vercel Serverless Function
// Retorna o histórico de vendas (pagamentos) do Mercado Pago e Pagar.me (Stone)
const https = require('https');

const supabaseUrl = 'https://hwmdwlpmutuhrlcgssqw.supabase.co';
const supabaseKey = 'sb_publishable_lo4UybgUFxCbAKVbT-Pkzw_8JEipiqT';

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

    try {
        let allSales = [];

        // 1. Consultar Configurações no Supabase para ver se tem chave do Pagar.me
        const storeSettings = await getStoreSettings(supabaseUrl, supabaseKey);
        const pagarmeApiKey = storeSettings?.pagarme_api_key;

        // --- MERCADO PAGO ---
        const accessToken = process.env.MP_ACCESS_TOKEN;
        if (accessToken) {
            try {
                const mpPath = '/v1/payments/search?sort=date_created&criteria=desc&limit=100';
                console.log('Buscando pagamentos no Mercado Pago...');
                const mpResponse = await callMercadoPago(mpPath, 'GET', accessToken);

                if (mpResponse && mpResponse.results) {
                    const sitePayments = mpResponse.results.filter(payment => 
                        payment.external_reference && 
                        String(payment.external_reference).toUpperCase().startsWith('BR-')
                    );

                    const mpSales = sitePayments.map(payment => {
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
                    
                    allSales = allSales.concat(mpSales);
                }
            } catch (err) {
                console.error('Erro ao buscar Mercado Pago:', err);
            }
        }

        // --- PAGAR.ME ---
        if (pagarmeApiKey) {
            try {
                console.log('Buscando pedidos no Pagar.me...');
                const pagarmeResponse = await callPagarMe('/orders?size=100', 'GET', null, pagarmeApiKey);
                
                if (pagarmeResponse && pagarmeResponse.data) {
                    const pmSiteOrders = pagarmeResponse.data.filter(order => order.code && String(order.code).toUpperCase().startsWith('BR-'));
                    
                    const pagarmeSales = pmSiteOrders.map(order => {
                        let status = 'pending';
                        if (order.status === 'paid') status = 'approved';
                        else if (order.status === 'canceled') status = 'cancelled';
                        else if (order.status === 'failed') status = 'rejected';
                        
                        const item = order.items?.[0] || {};
                        const title = item.description || 'Produto';
                        
                        const customerName = order.metadata?.cliente_nome || order.customer?.name || 'Não informado';
                        const customerPhone = order.metadata?.telefone || 'Não informado';
                        const customerEmail = order.customer?.email || 'Não informado';
                        const deliveryInfo = order.metadata?.entrega || 'Não informado';
                        
                        const amount = (order.amount || 0) / 100;
                        const charge = order.charges?.[0] || {};
                        const paymentMethod = charge.payment_method || 'unknown';
                        
                        return {
                            id: order.id,
                            date: order.created_at,
                            status: status,
                            statusDetail: order.status,
                            amount: amount,
                            paymentMethod: paymentMethod,
                            reference: order.code || 'Nenhuma',
                            productName: title,
                            customerName: customerName,
                            customerPhone: customerPhone,
                            customerEmail: customerEmail,
                            deliveryInfo: deliveryInfo
                        };
                    });

                    allSales = allSales.concat(pagarmeSales);
                }
            } catch (err) {
                console.error('Erro ao buscar no Pagar.me:', err);
            }
        }

        // Ordenar tudo por data decrescente
        allSales.sort((a, b) => new Date(b.date) - new Date(a.date));

        return res.status(200).json({ success: true, sales: allSales });

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

function callPagarMe(path, method, body, apiKey) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : '';
        const auth = Buffer.from(apiKey + ':').toString('base64');

        const options = {
            hostname: 'api.pagar.me',
            port: 443,
            path: `/core/v5${path}`,
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${auth}`,
                'User-Agent': 'barracao-reversa/1.0',
            },
        };

        if (body) {
            options.headers['Content-Length'] = Buffer.byteLength(data);
        }

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
        if (body) {
            request.write(data);
        }
        request.end();
    });
}

function getStoreSettings(supabaseUrl, supabaseKey) {
    return new Promise((resolve) => {
        const url = `${supabaseUrl}/rest/v1/store_settings?id=eq.1`;
        const options = {
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
            }
        };

        https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (Array.isArray(result) && result.length > 0) {
                        resolve(result[0]);
                    } else {
                        resolve(null);
                    }
                } catch {
                    resolve(null);
                }
            });
        }).on('error', (err) => {
            console.error('Erro ao carregar configurações do Supabase:', err);
            resolve(null);
        });
    });
}
