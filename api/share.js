const https = require('https');

// URL inferred from the dashboard screenshot
const supabaseUrl = 'https://hwmdwlpmutuhrlcgssqw.supabase.co';
// Key provided by the user
const supabaseKey = 'sb_publishable_lo4UybgUFxCbAKVbT-Pkzw_8JEipiqT';

module.exports = async function handler(req, res) {
    const { id } = req.query;

    // Base URL for redirect and tags
    const baseUrl = 'https://www.barracaoreversa.com.br';

    if (!id) {
        return res.redirect(302, baseUrl);
    }

    try {
        // Fetch product from Supabase REST API
        const productUrl = `${supabaseUrl}/rest/v1/products?id=eq.${id}&select=*`;

        const fetchProduct = () => {
            return new Promise((resolve, reject) => {
                const options = {
                    headers: {
                        'apikey': supabaseKey,
                        'Authorization': `Bearer ${supabaseKey}`,
                        'Content-Type': 'application/json'
                    }
                };

                https.get(productUrl, options, (resp) => {
                    let data = '';
                    resp.on('data', (chunk) => data += chunk);
                    resp.on('end', () => resolve(JSON.parse(data)));
                }).on("error", (err) => reject(err));
            });
        };

        const result = await fetchProduct();

        if (!result || result.length === 0) {
            return res.redirect(302, baseUrl);
        }

        const product = result[0];

        // Formatar preço
        const precoFormatado = 'R$ ' + parseFloat(product.price).toFixed(2).replace('.', ',');
        const descTexto = product.description
            ? `${product.description} - Por apenas ${precoFormatado} no PIX!`
            : `Produto incrível no Barracão Reversa. Por apenas ${precoFormatado}`;

        // Render simple HTML with OG tags and a JS redirect
        const html = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${product.name} | Barracão Reversa</title>
            <meta name="description" content="${descTexto}" />
            
            <!-- Open Graph / WhatsApp / Facebook -->
            <meta property="og:type" content="website" />
            <meta property="og:title" content="${product.name}" />
            <meta property="og:description" content="${descTexto}" />
            <meta property="og:image" content="${product.image || 'https://www.barracaoreversa.com.br/logo.png'}" />
            <meta property="og:image:type" content="image/jpeg" />
            <meta property="og:image:width" content="1200" />
            <meta property="og:image:height" content="630" />
            <meta property="og:url" content="${baseUrl}/api/share?id=${id}" />
            
            <!-- Twitter -->
            <meta name="twitter:card" content="summary_large_image">
            <meta name="twitter:title" content="${product.name}">
            <meta name="twitter:description" content="${descTexto}">
            <meta name="twitter:image" content="${product.image || 'https://barracao-reversa.vercel.app/logo.png'}">
            
            <script>
                // Redirect exactly to the product page
                window.location.replace("${baseUrl}/?p=${id}");
            </script>
        </head>
        <body>
            <p>Redirecionando para o produto <a href="${baseUrl}/?p=${id}">${product.name}</a>...</p>
        </body>
        </html>
        `;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).send(html);

    } catch (err) {
        console.error('Error fetching product for share:', err);
        return res.redirect(302, baseUrl);
    }
};
