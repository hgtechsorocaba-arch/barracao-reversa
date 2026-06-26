// api/check-payment.js — Vercel Serverless Function
// Verifica se um paymentId (do Mercado Pago ou Pagar.me) já foi processado/aprovado

const https = require('https');

const supabaseUrl = 'https://hwmdwlpmutuhrlcgssqw.supabase.co';
const supabaseKey = 'sb_publishable_lo4UybgUFxCbAKVbT-Pkzw_8JEipiqT';

module.exports = async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'GET') {
        res.setHeader('Allow', ['GET']);
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { paymentId } = req.query;
    if (!paymentId) {
        return res.status(400).json({ error: 'Parâmetro paymentId é obrigatório' });
    }

    try {
        const isProcessed = await checkPaymentProcessed(paymentId, supabaseUrl, supabaseKey);
        return res.status(200).json({ processed: isProcessed });
    } catch (err) {
        console.error('Erro ao verificar status do pagamento:', err);
        return res.status(500).json({ error: 'Erro interno no servidor', details: err.message });
    }
};

function checkPaymentProcessed(paymentId, url, key) {
    return new Promise((resolve) => {
        const urlObj = new URL(`${url}/rest/v1/processed_payments?payment_id=eq.${encodeURIComponent(paymentId)}`);
        
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'GET',
            headers: {
                'apikey': key,
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (Array.isArray(result) && result.length > 0) {
                        resolve(true);
                    } else {
                        resolve(false);
                    }
                } catch {
                    resolve(false);
                }
            });
        });

        req.on('error', (err) => {
            console.error('Erro na requisição ao Supabase:', err);
            resolve(false);
        });

        req.end();
    });
}
