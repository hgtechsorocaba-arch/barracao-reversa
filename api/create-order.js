// api/create-order.js — Vercel Serverless Function
// Cria uma preferência de pagamento no Mercado Pago ou Pagar.me (Stone)

const https = require('https');

const supabaseUrl = 'https://hwmdwlpmutuhrlcgssqw.supabase.co';
const supabaseKey = 'sb_publishable_lo4UybgUFxCbAKVbT-Pkzw_8JEipiqT';

module.exports = async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    try {
        const {
            productId,
            productName,
            price,
            quantity,
            customerName,
            customerEmail,
            customerPhone,
            customerCity,
            delivery,
            address,
            note,
        } = req.body;

        if (!productName || !price || !customerName || !customerEmail) {
            return res.status(400).json({ error: 'Dados obrigatórios ausentes' });
        }

        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers.host || 'www.barracaoreversa.com.br';
        const baseUrl = `${protocol}://${host}`;

        // 1. Consultar Configurações no Supabase
        const storeSettings = await getStoreSettings(supabaseUrl, supabaseKey);
        const gateway = storeSettings?.payment_gateway || 'mercadopago';

        // 1.5. Consultar estoque do produto para garantir disponibilidade
        if (productId && productId !== 'avulso') {
            const product = await getProduct(productId, supabaseUrl, supabaseKey);
            if (!product) {
                return res.status(404).json({ error: 'Produto não encontrado' });
            }
            const currentStock = (product.stock !== null && product.stock !== undefined && product.stock !== '') ? parseInt(product.stock, 10) : 0;
            const requestedQty = quantity ? parseInt(quantity, 10) : 1;
            if (currentStock <= 0 || requestedQty > currentStock || isNaN(currentStock)) {
                return res.status(400).json({ error: `Desculpe, este produto está esgotado (estoque: ${currentStock || 0}).` });
            }
        }

        console.log(`Utilizando gateway de pagamento: ${gateway}`);

        // 2. Se for Pagar.me (Stone)
        if (gateway === 'pagarme') {
            const pagarmeApiKey = storeSettings?.pagarme_api_key;
            if (!pagarmeApiKey) {
                return res.status(500).json({ error: 'Gateway Pagar.me selecionado mas a chave API não foi configurada no admin.' });
            }

            const externalRef = `BR-${Date.now()}`;
            const totalAmountCents = Math.round(parseFloat(price) * (quantity ? parseInt(quantity, 10) : 1) * 100);

            // Geramos a lista de opções de parcelas (1 a 12x)
            // O campo 'total' é obrigatório pela API do Pagar.me
            const installments = Array.from({ length: 12 }, (_, i) => ({
                number: i + 1,
                total: totalAmountCents
            }));

            const pagarmePayload = {
                type: 'order',
                name: productName.slice(0, 256),
                order_code: externalRef,
                success_url: `${baseUrl}/?pedido=confirmado&gateway=pagarme&external_reference=${externalRef}`,
                skip_checkout_success_page: true,
                cart_settings: {
                    items: [{
                        name: productName.slice(0, 256),
                        amount: Math.round(parseFloat(price) * 100), // Preço unitário em centavos
                        default_quantity: quantity ? parseInt(quantity, 10) : 1,
                        code: productId || 'avulso',
                        reference_id: productId || 'avulso'
                    }]
                },
                payment_settings: {
                    accepted_payment_methods: ['pix', 'credit_card'],
                    credit_card_settings: {
                        operation_type: 'auth_and_capture',
                        installments: installments
                    },
                    pix_settings: {
                        expires_in: 1440 // 24 horas em minutos
                    }
                },
                metadata: {
                    cliente_nome: customerName,
                    produto_id: productId || 'avulso',
                    quantidade: quantity ? parseInt(quantity, 10) : 1,
                    valor_unitario: parseFloat(price),
                    entrega: delivery + (address ? ` – ${address}` : ''),
                    cidade: customerCity,
                    telefone: customerPhone,
                    observacao: note || '',
                }
            };

            console.log('Enviando payload para Pagar.me...', JSON.stringify(pagarmePayload));
            const pagarmeResponse = await callPagarMe('/paymentlinks', 'POST', pagarmePayload, pagarmeApiKey);

            if (!pagarmeResponse.url) {
                console.error('Erro na resposta do Pagar.me:', JSON.stringify(pagarmeResponse, null, 2));
                return res.status(502).json({
                    error: 'Não foi possível gerar o link de pagamento na Stone/Pagar.me',
                    details: pagarmeResponse,
                });
            }

            return res.status(200).json({
                success: true,
                orderId: pagarmeResponse.id,
                checkoutUrl: pagarmeResponse.url,
            });
        }

        // 3. Caso contrário, padrão Mercado Pago (Checkout Pro)
        const accessToken = process.env.MP_ACCESS_TOKEN;
        if (!accessToken) {
            return res.status(500).json({ error: 'MP_ACCESS_TOKEN não configurado' });
        }

        const preference = {
            items: [{
                id: productId || 'produto',
                title: productName.slice(0, 256),
                quantity: quantity ? parseInt(quantity, 10) : 1,
                unit_price: parseFloat(price),
                currency_id: 'BRL',
            }],
            payer: {
                name: customerName.split(' ')[0],
                surname: customerName.split(' ').slice(1).join(' ') || '-',
                email: customerEmail,
            },
            back_urls: {
                success: `${baseUrl}/?pedido=confirmado`,
                failure: `${baseUrl}/?pedido=falhou`,
                pending: `${baseUrl}/?pedido=pendente`,
            },
            auto_return: 'approved',
            payment_methods: {
                excluded_payment_types: [
                    // Deixamos credit_card, debit_card e prepaid_card ATIVOS (não excluídos)
                    { id: 'ticket' }, // boletos
                    { id: 'atm' }     // pagamentos em lotérica
                ],
                excluded_payment_methods: [
                    { id: 'pec' } // pagamento em dinheiro / lotéricas específicas
                ],
                installments: 12, // Permitir até 12 parcelas
            },
            statement_descriptor: 'BARRACAO REVERSA',
            external_reference: `BR-${Date.now()}`,
            metadata: {
                cliente_nome: customerName,
                produto_id: productId || 'avulso',
                quantidade: quantity ? parseInt(quantity, 10) : 1,
                valor_unitario: parseFloat(price),
                entrega: delivery + (address ? ` – ${address}` : ''),
                cidade: customerCity,
                telefone: customerPhone,
                observacao: note || '',
            },
        };

        if (!baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1')) {
            preference.notification_url = `${baseUrl}/api/confirm-payment`;
        }

        const mpResponse = await callMercadoPago(
            '/checkout/preferences',
            'POST',
            preference,
            accessToken
        );

        if (!mpResponse.init_point) {
            console.error('MP response:', JSON.stringify(mpResponse, null, 2));
            return res.status(502).json({
                error: 'Não foi possível gerar o link de pagamento no Mercado Pago',
                details: mpResponse,
            });
        }

        return res.status(200).json({
            success: true,
            orderId: mpResponse.id,
            checkoutUrl: mpResponse.init_point,
            sandboxUrl: mpResponse.sandbox_init_point,
        });

    } catch (err) {
        console.error('Erro geral no checkout:', err);
        return res.status(500).json({ error: 'Erro interno', details: err.message });
    }
};

// Obter produto do Supabase
function getProduct(productId, supabaseUrl, supabaseKey) {
    return new Promise((resolve) => {
        const url = `${supabaseUrl}/rest/v1/products?id=eq.${encodeURIComponent(productId)}`;
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
            console.error('Erro ao carregar produto do Supabase:', err);
            resolve(null);
        });
    });
}

// Obter configurações do Supabase
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

// Utilitário para chamar a API do Mercado Pago
function callMercadoPago(path, method, body, accessToken) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);

        const options = {
            hostname: 'api.mercadopago.com',
            port: 443,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data),
                'Authorization': `Bearer ${accessToken}`,
                'X-Idempotency-Key': `br-${Date.now()}-${Math.random()}`,
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
        request.write(data);
        request.end();
    });
}

// Utilitário para chamar a API do Pagar.me
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
