// api/create-order.js — Vercel Serverless Function
// Cria uma preferência de pagamento no Mercado Pago (Checkout Pro)
// Docs: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/integrate-checkout-pro

const https = require('https');

module.exports = async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) {
        return res.status(500).json({ error: 'MP_ACCESS_TOKEN não configurado' });
    }

    try {
        const {
            productId,
            productName,
            price,
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

        const baseUrl = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}`
            : 'https://barracao-reversa.vercel.app';

        // Payload Mercado Pago Checkout Pro
        const preference = {
            items: [{
                id: productId || 'produto',
                title: productName.slice(0, 256),
                quantity: 1,
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
                    { id: 'credit_card' },
                    { id: 'debit_card' },
                    { id: 'prepaid_card' },
                    { id: 'ticket' }, // boletos
                    { id: 'atm' }     // pagamentos em lotérica
                ],
                excluded_payment_methods: [
                    { id: 'pec' } // pagamento em dinheiro / lotéricas específicas
                ],
                installments: 1,
            },
            statement_descriptor: 'BARRACAO REVERSA',
            external_reference: `BR-${Date.now()}`,
            metadata: {
                produto_id: productId || 'avulso',
                entrega: delivery + (address ? ` – ${address}` : ''),
                cidade: customerCity,
                telefone: customerPhone,
                observacao: note || '',
            },
        };

        const mpResponse = await callMercadoPago(
            '/checkout/preferences',
            'POST',
            preference,
            accessToken
        );

        if (!mpResponse.init_point) {
            console.error('MP response:', JSON.stringify(mpResponse, null, 2));
            return res.status(502).json({
                error: 'Não foi possível gerar o link de pagamento',
                details: mpResponse,
            });
        }

        return res.status(200).json({
            success: true,
            orderId: mpResponse.id,
            checkoutUrl: mpResponse.init_point, // URL de produção
            sandboxUrl: mpResponse.sandbox_init_point, // URL de testes
        });

    } catch (err) {
        console.error('Erro ao criar preferência MP:', err);
        return res.status(500).json({ error: 'Erro interno', details: err.message });
    }
};

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
