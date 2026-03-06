/* =====================================================
   BARRACÃO REVERSA – APP.JS
   Lógica: produtos, carrinho, checkout, admin, WhatsApp
   ===================================================== */

// ── CONFIG ──────────────────────────────────────────
const CONFIG = {
    whatsappNumber: '5515996966956', // número do lojista (com DDI 55)
    adminPassword: 'Everton2023@',    // ← TROCAR pela senha desejada
    storeName: 'Barracão Reversa',
    apiBaseUrl: '',  // vazio = mesma origin (funciona tanto local quanto Vercel)
};

// ── STATE ────────────────────────────────────────────
let products = [];
let selectedProduct = null;
let adminLoggedIn = false;
let imageBase64 = null;

// ── SAMPLE PRODUCTS (demo) ───────────────────────────
const DEMO_PRODUCTS = [
    {
        id: 'demo-1',
        name: 'Controlador de Temperatura Refrigeração Coel Y39 Bivolt 127/220v',
        category: 'Controladores',
        price: 143.40,
        description: 'Controlador eletrônico de temperatura, bivolt 127/220v. Ideal para refrigeração industrial. Funcionando perfeitamente.',
        condition: 'Revisado e Testado',
        stock: 2,
        urgent: true,
        image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&h=300&fit=crop',
        createdAt: Date.now() - 60000,
    },
    {
        id: 'demo-2',
        name: 'Roteador TP-Link TL-WR941ND 300Mbps',
        category: 'Roteadores',
        price: 55.00,
        description: 'Roteador wireless 300Mbps com 3 antenas destacáveis. Testado e funcionando. Acompanha fonte.',
        condition: 'Usado – Bom estado',
        stock: 5,
        urgent: false,
        image: 'https://images.unsplash.com/photo-1606904825846-647eb07f5be2?w=400&h=300&fit=crop',
        createdAt: Date.now() - 120000,
    },
    {
        id: 'demo-3',
        name: 'Fonte ATX 500W Real Visão',
        category: 'Fontes',
        price: 89.90,
        description: 'Fonte ATX 500W Real Visão. Sem marcas de queima. Todos os conectores presentes. Seminova.',
        condition: 'Revisado e Testado',
        stock: 1,
        urgent: true,
        image: 'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=400&h=300&fit=crop',
        createdAt: Date.now() - 180000,
    },
    {
        id: 'demo-4',
        name: 'Placa-mãe H61 LGA1155 DDR3 – Testada',
        category: 'Placas',
        price: 120.00,
        description: 'Placa-mãe para processadores Intel Sandy Bridge / Ivy Bridge LGA1155. DDR3. Testada com POST ok.',
        condition: 'Usado – Bom estado',
        stock: 3,
        urgent: false,
        image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&h=300&fit=crop&sat=-50',
        createdAt: Date.now() - 240000,
    },
    {
        id: 'demo-5',
        name: 'Caixa de Som Multilaser 2.1 com Subwoofer',
        category: 'Áudio',
        price: 75.00,
        description: 'Sistema 2.1 com subwoofer ativo. Som potente. Controle de volume e entradas P2 e RCA. Funcionando.',
        condition: 'Revisado e Testado',
        stock: 4,
        urgent: false,
        image: 'https://images.unsplash.com/photo-1545454675-3531b543be5d?w=400&h=300&fit=crop',
        createdAt: Date.now() - 300000,
    },
    {
        id: 'demo-6',
        name: 'HD Externo 1TB Seagate Backup Plus',
        category: 'Informática',
        price: 199.00,
        description: 'HD Externo 1TB USB 3.0. Sem erros, testado com Crystal Disk Info. Acompanha cabo USB.',
        condition: 'Revisado e Testado',
        stock: 0,
        urgent: true,
        image: 'https://images.unsplash.com/photo-1531492746076-161ca9bcad58?w=400&h=300&fit=crop',
        createdAt: Date.now() - 360000,
    },
];

// ── LOAD / SAVE ──────────────────────────────────────
function loadProducts() {
    try {
        const stored = localStorage.getItem('br_products');
        const custom = stored ? JSON.parse(stored) : [];
        products = [...DEMO_PRODUCTS, ...custom];
    } catch {
        products = [...DEMO_PRODUCTS];
    }
}

function saveCustomProducts() {
    try {
        const custom = products.filter(p => !p.id.startsWith('demo-'));
        localStorage.setItem('br_products', JSON.stringify(custom));
    } catch (e) {
        console.warn('localStorage indisponível:', e);
    }
}

// ── RENDER GRID ──────────────────────────────────────
function formatPrice(value) {
    return 'R$ ' + parseFloat(value).toFixed(2).replace('.', ',');
}

function calcOriginalPrice(price) {
    // Preço original ~33% acima do preço de venda (arredondado para .90)
    const raw = parseFloat(price) * 1.33;
    return Math.ceil(raw / 10) * 10 - 0.10;
}

function stockLabel(stock) {
    if (stock === 0) return { text: '❌ Esgotado', cls: 'badge-out' };
    if (stock === 1) return { text: '⚠️ Último!', cls: 'badge-low' };
    if (stock <= 3) return { text: `⚡ ${stock} restantes`, cls: 'badge-low' };
    return { text: `✅ ${stock} em estoque`, cls: 'badge-ok' };
}

function renderProducts(list) {
    const grid = document.getElementById('productsGrid');
    const empty = document.getElementById('emptyState');

    if (!list || list.length === 0) {
        grid.innerHTML = '';
        empty.style.display = 'flex';
        return;
    }

    empty.style.display = 'none';

    grid.innerHTML = list.map(p => {
        const sl = stockLabel(p.stock ?? 99);
        const sold = (p.stock ?? 99) === 0;
        return `
    <div class="product-card${sold ? ' card-sold' : ''}" data-id="${p.id}" tabindex="0" role="button" aria-label="Ver produto ${p.name}">
      <div class="card-image-wrap">
        <img src="${p.image}" alt="${p.name}" loading="lazy" onerror="this.src='data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'100\' height=\'100\'><rect width=\'100%\' height=\'100%\' fill=\'%231e2a3a\'/><text y=\'50%\' x=\'50%\' text-anchor=\'middle\' fill=\'%238892a4\' font-size=\'14\' dy=\'.3em\'>📷 Sem foto</text></svg>'" />
        ${p.urgent && !sold ? '<span class="card-badge-urgent">⚡ Últimas unidades</span>' : ''}
        <span class="card-category">${p.category}</span>
        ${sold ? '<div class="card-sold-overlay">ESGOTADO</div>' : ''}
      </div>
      <div class="card-body">
        <div class="card-name">${p.name}</div>
        <div class="card-description">${p.description}</div>
        <div class="card-condition">✅ ${p.condition}</div>
        <div class="card-price-row">
          <div>
            <div class="card-price-original">De ${formatPrice(calcOriginalPrice(p.price))}</div>
            <div class="card-price">Por ${formatPrice(p.price)}</div>
            <div class="card-pix">💰 Pagamento via PIX</div>
          </div>
          <span class="stock-badge ${sl.cls}">${sl.text}</span>
        </div>
      </div>
      <div class="card-footer">
        <button class="btn-details" data-id="${p.id}">Ver Detalhes</button>
        <div class="card-footer-actions">
          <button class="btn-buy" data-id="${p.id}" ${sold ? 'disabled' : ''}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.136.559 4.14 1.535 5.874L.057 23.547a.75.75 0 0 0 .915.921l5.798-1.52A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.893 0-3.665-.517-5.18-1.418l-.37-.219-3.842 1.008 1.026-3.741-.24-.387A9.953 9.953 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
            ${sold ? 'Esgotado' : 'Comprar'}
          </button>
          <button class="btn-share" data-id="${p.id}" aria-label="Compartilhar no WhatsApp" title="Compartilhe com um amigo" style="display: flex; gap: 6px;">
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/></svg>
            Compartilhe
          </button>
        </div>
      </div>
    </div>
  `;
    }).join('');

    // Bind details buttons
    grid.querySelectorAll('.btn-details').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            openCheckout(btn.dataset.id);
        });
    });

    // Bind buy buttons
    grid.querySelectorAll('.btn-buy:not([disabled])').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            const id = btn.dataset.id;
            openCheckout(id);
            showCheckoutForm();
        });
    });

    // Bind share buttons
    grid.querySelectorAll('.btn-share').forEach(btn => {
        btn.addEventListener('click', async e => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const p = products.find(prod => prod.id === id);
            if (!p) return;

            const baseUrl = window.location.origin;
            const productUrl = `${baseUrl}/?p=${p.id}`;
            const shareText = `*${p.name}*\n\n💰 *${formatPrice(p.price)}*\n🔒 Pagamento total via PIX\n\n📲 Clique em *Comprar* → preencha seus dados → pague via PIX\n⚡ Garanta o seu antes que acabe!\n\n🛒 *COMPRAR:* ${productUrl}\n\n_Compra rápida e segura via PIX_`;

            // Tenta usar a Web Share API (compartilha a foto diretamente no WhatsApp)
            if (navigator.share && p.image && !p.image.startsWith('data:')) {
                try {
                    const response = await fetch(p.image);
                    const blob = await response.blob();
                    const ext = blob.type.includes('png') ? 'png' : 'jpg';
                    const file = new File([blob], `produto.${ext}`, { type: blob.type });

                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            files: [file],
                            title: p.name,
                            text: shareText,
                        });
                        return;
                    }
                } catch (err) {
                    console.warn('Web Share API com arquivo falhou, usando fallback:', err);
                }
            }

            // Fallback: abre o WhatsApp com texto + link (desktop ou imagem base64)
            const wppUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
            window.open(wppUrl, '_blank');
        });
    });

    // Card click opens checkout too
    grid.querySelectorAll('.product-card').forEach(card => {
        card.style.cursor = 'pointer';
        card.addEventListener('click', e => {
            if (e.target.closest('button')) return;
            openCheckout(card.dataset.id);
        });
        card.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openCheckout(card.dataset.id);
            }
        });
    });
}

// ── FILTER ───────────────────────────────────────────
function applyFilters() {
    const q = document.getElementById('searchInput').value.toLowerCase().trim();
    const cat = document.getElementById('categorySelect').value;
    const filtered = products.filter(p => {
        const matchQ = !q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
        const matchCat = !cat || p.category === cat;
        return matchQ && matchCat;
    });
    renderProducts(filtered);
}

// ── CHECKOUT MODAL ────────────────────────────────────
let currentProduct = null;
let selectedVariations = {};

function openCheckout(id) {
    const p = (typeof allProducts !== 'undefined' ? allProducts : products).find(item => item.id === id);
    if (!p) return;

    currentProduct = p;
    selectedVariations = {};

    const overlay = document.getElementById('checkoutModal');
    const detailsContainer = document.getElementById('productDetailsView');
    const formContainer = document.getElementById('checkoutFormView');

    if (overlay) overlay.classList.add('active', 'full-view');
    document.body.style.overflow = 'hidden';

    if (detailsContainer) detailsContainer.style.display = 'none';
    if (formContainer) formContainer.style.display = 'block';

    renderProductDetails(p);
    showCheckoutForm();
}

function renderProductDetails(p) {
    const container = document.getElementById('productDetailsView');
    if (!container) return;

    // Fotos
    const images = p.images && p.images.length > 0 ? p.images : [p.image];
    const thumbsHtml = images.map((img, i) => `
        <div class="thumb-item ${i === 0 ? 'active' : ''}" onclick="changeDetailImage(this, '${img}')">
            <img src="${img}">
        </div>
    `).join('');

    // Variações
    let variationsHtml = '';
    if (p.variations && p.variations.length > 0) {
        variationsHtml = p.variations.map(v => {
            const options = v.values.split(',').map(opt => opt.trim());
            return `
                <div class="variation-group">
                    <span class="variation-label">${v.name}:</span>
                    <div class="variation-options">
                        ${options.map(opt => `
                            <div class="option-capsule" onclick="selectVariation(this, '${v.name}', '${opt}')">${opt}</div>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }

    container.innerHTML = `
        <button class="modal-close-btn" onclick="closeCheckout()">✕</button>
        <div class="product-details-view">
            <div class="details-gallery">
                <div class="gallery-thumbs">
                    ${thumbsHtml}
                </div>
                <div class="details-image-section">
                    <img id="mainDetailImage" src="${images[0]}" class="main-detail-img">
                </div>
            </div>

            <div class="details-info-section">
                <div class="details-header">
                    <span class="details-condition">${p.condition || 'Revisado e Testado'}</span>
                    <h1 class="details-title">${p.name}</h1>
                </div>

                <div class="details-price-card">
                    <div class="exclusive-badge">OFERTA EXCLUSIVA</div>
                    <div class="price-container">
                        <div class="price-old">De ${formatPrice(calcOriginalPrice(p.price))}</div>
                        <div class="price-row-modal">
                            <span class="price-current">Por ${formatPrice(p.price)}</span>
                            <span class="price-method">no PIX</span>
                        </div>
                    </div>
                </div>

                <div class="product-selections">
                    ${variationsHtml}
                </div>

                <div class="trust-badges">
                    <div class="trust-badge">
                        <div class="trust-badge-icon">🛡️</div>
                        <div class="trust-badge-text">
                            <strong>Garantia de 90 dias</strong>
                            <span>Troca ou reparo imediato</span>
                        </div>
                    </div>
                    <div class="trust-badge">
                        <div class="trust-badge-icon">📍</div>
                        <div class="trust-badge-text">
                            <strong>Local de Retirada</strong>
                            <span>Rua Joyce Claudia de Paula 31, Bairro Link</span>
                        </div>
                    </div>
                </div>

                <div class="details-actions">
                    <button class="btn-confirm-order" onclick="showCheckoutForm()" style="width:100%; border-radius:8px; padding:18px;">
                        Comprar agora
                    </button>
                    <p class="stock-info" style="margin-top:10px; text-align:center; font-size:0.85rem; color:#666;">
                        Estoque disponível: <strong>${p.stock} unidades</strong>
                    </p>
                </div>
            </div>
        </div>
    `;
}

window.changeDetailImage = function (el, src) {
    const main = document.getElementById('mainDetailImage');
    if (main) main.src = src;
    document.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
};

window.selectVariation = function (el, attr, val) {
    const parent = el.parentElement;
    parent.querySelectorAll('.option-capsule').forEach(opt => opt.classList.remove('selected'));
    el.classList.add('selected');
    selectedVariations[attr] = val;
};

function showCheckoutForm() {
    if (currentProduct.variations && currentProduct.variations.length > 0) {
        const missing = currentProduct.variations.find(v => !selectedVariations[v.name]);
        if (missing) {
            showToast(`⚠️ Selecione a opção: ${missing.name}`);
            return;
        }
    }

    const detailsView = document.getElementById('productDetailsView');
    const formView = document.getElementById('checkoutFormView');

    if (detailsView) detailsView.style.display = 'none';
    if (formView) formView.style.display = 'block';

    const varSummary = Object.entries(selectedVariations).map(([k, v]) => `${k}: ${v}`).join(' · ');

    const summaryEl = document.getElementById('checkoutSummary');
    if (summaryEl) {
        summaryEl.innerHTML = `
            <div class="mini-product" style="display:flex; gap:12px; margin-bottom:20px; padding:12px; background:#f9f9f9; border-radius:8px;">
                <img src="${currentProduct.image}" width="60" height="60" style="border-radius:4px; object-fit:cover; border:1px solid #ddd;">
                <div>
                    <div style="font-weight:700; font-size:1rem; color:#333;">${currentProduct.name}</div>
                    <div style="font-size:0.85rem; color:#666; margin:4px 0;">${varSummary}</div>
                    <div style="color:#1e88e5; font-weight:800; font-size:1.1rem;">R$ ${parseFloat(currentProduct.price).toFixed(2).replace('.', ',')}</div>
                </div>
            </div>
        `;
    }
}

function closeCheckout() {
    const overlay = document.getElementById('checkoutModal');
    if (overlay) overlay.classList.remove('active', 'full-view');
    document.body.style.overflow = '';
}

// ── FORM SUBMIT ───────────────────────────────────────
document.getElementById('checkoutForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const name = document.getElementById('userName').value.trim();
    const phone = document.getElementById('userPhone').value.trim();

    const email = document.getElementById('userEmail').value.trim();

    if (!name || !phone || !email) {
        showToast('⚠️ Preencha nome, e-mail e WhatsApp');
        return;
    }

    const btn = document.getElementById('btnConfirmOrder');
    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Processando...';
    }

    const deliveryMsg = `Retirada: No local (Bairro Link)`;

    const varText = Object.entries(selectedVariations).length > 0
        ? ` (${Object.entries(selectedVariations).map(([k, v]) => `${k}: ${v}`).join(', ')})`
        : '';

    const payload = {
        productId: currentProduct.id,
        productName: currentProduct.name + varText,
        price: currentProduct.price,
        customerName: name,
        customerEmail: email,
        customerPhone: phone,
        delivery: deliveryMsg,
        address: ''
    };

    fetch('/api/create-order', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    })
        .then(res => res.json())
        .then(data => {
            if (data.checkoutUrl) {
                window.location.href = data.checkoutUrl;
            } else {
                showToast('❌ Erro ao gerar link de pagamento: ' + (data.error || 'Desconhecido'));
                if (btn) {
                    btn.disabled = false;
                    btn.innerText = 'Finalizar Compra';
                }
            }
        })
        .catch(err => {
            console.error('Erro no checkout:', err);
            showToast('❌ Ocorreu um erro. Tente novamente.');
            if (btn) {
                btn.disabled = false;
                btn.innerText = 'Finalizar Compra';
            }
        });
});



// ── TOAST ─────────────────────────────────────────────
function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── SEARCH / FILTER EVENTS ────────────────────────────
const searchInp = document.getElementById('searchInput');
if (searchInp) searchInp.addEventListener('input', applyFilters);

const catSel = document.getElementById('categorySelect');
if (catSel) catSel.addEventListener('change', applyFilters);

// ── PHONE MASK ────────────────────────────────────────
const phoneInp = document.getElementById('userPhone');
if (phoneInp) {
    phoneInp.addEventListener('input', function () {
        let v = this.value.replace(/\D/g, '').slice(0, 11);
        if (v.length > 6) {
            v = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
        } else if (v.length > 2) {
            v = `(${v.slice(0, 2)}) ${v.slice(2)}`;
        } else if (v.length > 0) {
            v = `(${v}`;
        }
        this.value = v;
    });
}

// ── INIT ──────────────────────────────────────────────
async function applyStoreSettings() {
    if (typeof supabaseClient === 'undefined') return;

    try {
        const { data, error } = await supabaseClient
            .from('store_settings')
            .select('*')
            .eq('id', 1)
            .single();

        if (error || !data) return;

        // 1. WhatsApp
        if (data.whatsapp_number) {
            CONFIG.whatsappNumber = data.whatsapp_number;
            // Update links if necessary
            document.querySelectorAll('a[href^="https://wa.me/"]').forEach(a => {
                const url = new URL(a.href);
                url.pathname = '/' + data.whatsapp_number;
                a.href = url.toString();
            });
        }

        // 2. Primary Color Overrides
        if (data.primary_color && data.primary_color !== '#1e2a3a') {
            const root = document.querySelector(':root');
            root.style.setProperty('--primary', data.primary_color);
            // Rough approximation for dark variant just for this custom override
            root.style.setProperty('--primary-dark', data.primary_color);
        }

        // 3. Logo
        if (data.logo_url) {
            document.querySelectorAll('.logo-img-header, .logo-img-footer').forEach(img => {
                img.src = data.logo_url;
            });
        }

        // 4. Banners
        if (data.banners && data.banners.length > 0) {
            const slider = document.getElementById('bannerSlider');
            if (slider) {
                slider.innerHTML = data.banners.map(url => `
                    <div class="banner-slide">
                        <img src="${url}" class="banner-img" alt="Banner Promocional">
                    </div>
                `).join('');
                slider.style.display = 'flex';

                // Add margins around hero to make space for banners if we keep both
                const hero = document.querySelector('.hero');
                if (hero) hero.style.display = 'none'; // hide hero if there are banners? Or show both. Let's hide the big hero if there are custom banners, because banners are usually intended as a replacement for the hero real estate.
            }
        }

    } catch (err) {
        console.error('Failed to apply store settings:', err);
    }
}

async function init() {
    // Carrega produtos
    loadProducts();
    renderProducts(typeof allProducts !== 'undefined' ? allProducts : products);

    // Apply Supabase Customizations
    await applyStoreSettings();

    // Check custom URLs
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('p');
    if (productId) {
        setTimeout(() => {
            openCheckout(productId);
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 500);
    }
}

init();
