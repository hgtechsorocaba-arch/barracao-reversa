// admin.js
// Lógica para o novo Painel do Vendedor

const CONFIG = {
    adminPassword: 'Everton2023@' // Deve ser a mesma do app.js original
};

// ── STATE ────────────────────────────────────────────
let products = [];
let imagesBase64 = new Array(10).fill(null);
let variations = [];
let editingId = null; // Guardar ID do produto sendo editado

// ── INIT & AUTH ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    // Check login state nas sessões (evita relogar a cada F5)
    if (sessionStorage.getItem('br_admin_logged') === 'true') {
        showDashboard();
    }
});

document.getElementById('btnLogin').addEventListener('click', attemptLogin);
document.getElementById('adminPass').addEventListener('keydown', e => {
    if (e.key === 'Enter') attemptLogin();
});

document.getElementById('togglePass').addEventListener('click', function () {
    const passInput = document.getElementById('adminPass');
    const type = passInput.getAttribute('type') === 'password' ? 'text' : 'password';
    passInput.setAttribute('type', type);
    this.textContent = type === 'password' ? '👁️' : '🕶️';
});

document.getElementById('btnLogout').addEventListener('click', (e) => {
    e.preventDefault();
    sessionStorage.removeItem('br_admin_logged');
    location.reload();
});

function attemptLogin() {
    const pw = document.getElementById('adminPass').value;
    if (pw === CONFIG.adminPassword) {
        sessionStorage.setItem('br_admin_logged', 'true');
        showDashboard();
    } else {
        showToast('❌ Senha incorreta.');
        document.getElementById('adminPass').value = '';
        document.getElementById('adminPass').focus();
    }
}

async function showDashboard() {
    document.getElementById('loginOverlay').classList.add('hidden');
    document.getElementById('dashboard').style.display = 'flex';
    initPhotoSlots();
    await loadProducts();
    renderTable();
}

// ── NAVIGATION (TABS) ────────────────────────────────
document.querySelectorAll('.nav-item[data-view]').forEach(tab => {
    tab.addEventListener('click', (e) => {
        e.preventDefault();
        switchView(tab.dataset.view);
    });
});

function switchView(viewId) {
    // Update nav classes
    document.querySelectorAll('.nav-item[data-view]').forEach(t => t.classList.remove('active'));
    const targetTab = document.querySelector(`.nav-item[data-view="${viewId}"]`);
    if (targetTab) targetTab.classList.add('active');

    // Mudar divs de visualização
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');

    // Se voltar pra lista, limpa o form e recarrega itens
    if (viewId === 'view-list') {
        loadProducts().then(() => renderTable());
        resetForm();
    }
}

function resetForm() {
    editingId = null;
    document.getElementById('formAd').reset();
    document.getElementById('view-create').querySelector('h1').textContent = 'Cadastrar Produto';
    document.getElementById('btnSubmit').textContent = 'Publicar Anúncio';

    imagesBase64 = new Array(10).fill(null);
    renderPhotoSlots();

    variations = [];
    renderVariations();
}

// ── PHOTO SLOTS LOGIC ────────────────────────────────
function initPhotoSlots() {
    renderPhotoSlots();
    document.getElementById('multiImageInput').addEventListener('change', handleMultiUpload);

    // Global drag handling to prevent browser open
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
        document.addEventListener(evt, e => {
            e.preventDefault();
            e.stopPropagation();
        });
    });
}

function renderPhotoSlots() {
    const grid = document.getElementById('photosGrid');
    grid.innerHTML = imagesBase64.map((img, i) => `
        <div class="photo-slot ${img ? 'has-image' : ''}" 
             onclick="triggerSlotUpload(${i})"
             ondragover="handleSlotDragOver(event, this)"
             ondragleave="handleSlotDragLeave(event, this)"
             ondrop="handleSlotDrop(event, ${i}, this)">
            
            ${img ? `<img src="${img}">` : `<div class="slot-placeholder">+</div>`}
            
            <button type="button" class="btn-url-slot" title="Colar URL da imagem" onclick="triggerUrlUpload(event, ${i})">🔗</button>
            
            ${img ? `<button type="button" class="btn-remove-slot" onclick="removeSlotImg(event, ${i})">✖</button>` : ''}
            
            <div class="slot-label">${i === 0 ? 'Principal' : `Foto ${i + 1}`}</div>
        </div>
    `).join('');
}

let activeSlotIndex = null;
window.triggerSlotUpload = function (index) {
    activeSlotIndex = index;
    document.getElementById('multiImageInput').click();
};

window.triggerUrlUpload = function (e, index) {
    e.stopPropagation();
    const url = prompt('Cole o endereço (URL) da imagem aqui:');
    if (url && (url.startsWith('http') || url.startsWith('data:'))) {
        imagesBase64[index] = url;
        renderPhotoSlots();
    } else if (url) {
        showToast('❌ URL inválida.');
    }
};

window.handleSlotDragOver = function (e, el) {
    e.preventDefault();
    el.classList.add('drag-over');
};

window.handleSlotDragLeave = function (e, el) {
    el.classList.remove('drag-over');
};

window.handleSlotDrop = function (e, index, el) {
    e.preventDefault();
    el.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        if (!file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            imagesBase64[index] = event.target.result;
            renderPhotoSlots();
        };
        reader.readAsDataURL(file);
    }
};

function handleMultiUpload(e) {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    files.forEach((file, idx) => {
        let targetIndex = activeSlotIndex !== null ? activeSlotIndex : imagesBase64.findIndex(slot => !slot);
        if (targetIndex === -1) return;
        if (activeSlotIndex !== null && idx > 0) return;

        if (!file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            if (activeSlotIndex !== null) {
                imagesBase64[activeSlotIndex] = event.target.result;
            } else {
                const nextEmpty = imagesBase64.findIndex(slot => !slot);
                if (nextEmpty !== -1) imagesBase64[nextEmpty] = event.target.result;
            }
            renderPhotoSlots();
            activeSlotIndex = null;
        };
        reader.readAsDataURL(file);
    });
    e.target.value = '';
}

window.removeSlotImg = function (e, index) {
    e.stopPropagation();
    imagesBase64[index] = null;
    renderPhotoSlots();
};

// ── VARIATIONS LOGIC ────────────────────────────────
window.addVariationRow = function () {
    variations.push({ name: '', values: '' });
    renderVariations();
};

window.removeVariation = function (index) {
    variations.splice(index, 1);
    renderVariations();
};

function renderVariations() {
    const container = document.getElementById('variationsContainer');
    container.innerHTML = variations.map((v, i) => `
        <div class="variation-row">
            <button type="button" class="btn-remove-var" onclick="removeVariation(${i})">✖</button>
            <div class="variation-header">
                <input type="text" class="form-control" placeholder="Nome (ex: Cor)" value="${v.name}" oninput="updateVar(${i}, 'name', this.value)">
                <input type="text" class="form-control flex-1" placeholder="Opções (ex: Azul, Verde)" value="${v.values}" oninput="updateVar(${i}, 'values', this.value)">
            </div>
            <small class="color-mute">Separe os valores por vírgula.</small>
        </div>
    `).join('');
}

window.updateVar = function (index, field, val) {
    variations[index][field] = val;
};

// ── CRUD LOGIC ───────────────────────────────────────
async function loadProducts() {
    if (!window.supabaseClient) return;
    try {
        const { data, error } = await window.supabaseClient
            .from('products')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        products = data || [];
    } catch (err) {
        console.error('Erro ao carregar produtos:', err);
        showToast('❌ Erro ao carregar produtos do banco.');
    }
}

// saveProducts não é mais necessário como função global, pois salvamos no submit

function renderTable() {
    const tbody = document.getElementById('adsTbody');
    const emptyState = document.getElementById('emptyAds');

    // Filtro de busca (opcional)
    const q = document.getElementById('searchAds').value.toLowerCase();
    const filtered = products.filter(p => !p.id.startsWith('demo-') && (p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)));

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';

    tbody.innerHTML = filtered.sort((a, b) => b.createdAt - a.createdAt).map(p => {
        // Compatibilidade: se não tem array de images, usa p.image
        const thumb = p.images && p.images.length > 0 ? p.images[0] : p.image;

        return `
            <tr>
                <td><img src="${thumb}" class="td-img" onerror="this.src='data:image/svg+xml,<svg xmlns=\\\'http://www.w3.org/2000/svg\\\' width=\\\'48\\\' height=\\\'48\\\'><rect width=\\\'100%\\\' height=\\\'100%\\\' fill=\\\'%23eee\\\'/></svg>'" /></td>
                <td>
                    <div class="td-title">${p.name}</div>
                    <div class="td-desc">REF: #${p.id.split('-')[1]} • ${p.category}</div>
                </td>
                <td style="font-weight: 600;">R$ ${parseFloat(p.price).toFixed(2).replace('.', ',')}</td>
                <td><span class="badge-stock">${p.stock} un.</span></td>
                <td>
                    <div style="display:flex; gap: 8px;">
                        <button class="btn-sm" style="background:#25d366; color:white; border:none; border-radius:4px; cursor:pointer;" onclick="promptAndSendWhatsApp('${p.id}')">📢 Anunciar</button>
                        <button class="btn-danger" style="color:var(--ml-blue); border:1px solid #ddd; background:none; padding:4px 8px; border-radius:4px; cursor:pointer;" onclick="editAd('${p.id}')">Editar</button>
                        <button class="btn-danger" style="color:red; border:1px solid #ddd; background:none; padding:4px 8px; border-radius:4px; cursor:pointer;" onclick="deleteAd('${p.id}')">Excluir</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

document.getElementById('searchAds').addEventListener('input', renderTable);

window.editAd = function (id) {
    const p = products.find(prod => prod.id === id);
    if (!p) return;

    editingId = id;
    switchView('view-create');

    // Preencher campos
    document.getElementById('adName').value = p.name;
    document.getElementById('adDesc').value = p.description;
    document.getElementById('adCat').value = p.category;
    document.getElementById('adCond').value = p.condition;
    document.getElementById('adPrice').value = p.price;
    document.getElementById('adStock').value = p.stock || 1;
    document.getElementById('adUrgent').checked = p.urgent || false;

    // Carregar Fotos
    imagesBase64 = new Array(10).fill(null);
    if (p.images && p.images.length) {
        p.images.forEach((img, i) => { if (i < 10) imagesBase64[i] = img; });
    } else if (p.image) {
        imagesBase64[0] = p.image;
    }
    renderPhotoSlots();

    // Carregar Variações
    variations = p.variations || [];
    renderVariations();

    // UI Feedback
    document.getElementById('view-create').querySelector('h1').textContent = 'Editar Anúncio';
    document.getElementById('btnSubmit').textContent = 'Salvar Alterações';
};

window.deleteAd = async function (id) {
    if (confirm('Excluir anúncio?')) {
        try {
            const { error } = await window.supabaseClient
                .from('products')
                .delete()
                .eq('id', id);

            if (error) throw error;

            products = products.filter(p => p.id !== id);
            renderTable();
            showToast('🗑️ Removido!');
        } catch (err) {
            console.error('Erro ao deletar:', err);
            showToast('❌ Erro ao excluir do banco.');
        }
    }
};

document.getElementById('formAd').addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('btnSubmit');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    // Filtra apenas fotos preenchidas
    const finalImages = imagesBase64.filter(img => img !== null);

    if (finalImages.length === 0) {
        showToast('❌ Adicione pelo menos uma foto!');
        btn.disabled = false;
        btn.textContent = editingId ? 'Salvar Alterações' : 'Publicar Anúncio';
        return;
    }

    const priceInput = document.getElementById('adPrice').value;
    const priceFloat = parseFloat(priceInput.replace(',', '.'));

    const adData = {
        name: document.getElementById('adName').value.trim(),
        description: document.getElementById('adDesc').value.trim(),
        category: document.getElementById('adCat').value,
        condition: document.getElementById('adCond').value,
        price: priceFloat,
        stock: parseInt(document.getElementById('adStock').value, 10),
        urgent: document.getElementById('adUrgent').checked,
        images: finalImages,
        image: finalImages[0], // Capa principal (compatibilidade)
        variations: variations.filter(v => v.name.trim() !== ''),
        updated_at: new Date().toISOString()
    };

    try {
        if (editingId) {
            // UPDATE
            const { error } = await window.supabaseClient
                .from('products')
                .update(adData)
                .eq('id', editingId);

            if (error) throw error;
            showToast('✅ Atualizado!');
        } else {
            // CREATE
            const id = 'prod-' + Date.now().toString(36);
            const { error } = await window.supabaseClient
                .from('products')
                .insert([{ id, ...adData, created_at: new Date().toISOString() }]);

            if (error) throw error;
            showToast('✅ Publicado!');
        }

        await loadProducts(); // Recarrega a lista local
        switchView('view-list');
    } catch (err) {
        console.error('Erro ao salvar produto:', err);
        showToast('❌ Erro ao salvar no Supabase.');
    } finally {
        btn.disabled = false;
        btn.textContent = editingId ? 'Salvar Alterações' : 'Publicar Anúncio';
    }
});

// ── TOAST HELPER ─────────────────────────────────────
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ── SETTINGS SUPABASE LOGIC ─────────────────────────────
let storeSettings = {
    whatsapp_number: '5515996966956',
    primary_color: '#1e2a3a',
    logo_url: 'logo.png',
    banners: []
};

async function loadSettings() {
    if (!window.supabaseClient) return;
    try {
        const { data, error } = await supabaseClient
            .from('store_settings')
            .select('*')
            .eq('id', 1)
            .single();

        if (data) {
            storeSettings = { ...storeSettings, ...data };
        }
    } catch (err) {
        console.error('Error loading settings:', err);
    }

    // Fill UI
    document.getElementById('setWhatsapp').value = storeSettings.whatsapp_number || '';
    document.getElementById('setPrimaryColor').value = storeSettings.primary_color || '#1e2a3a';
    document.getElementById('colorHexDisplay').textContent = storeSettings.primary_color || '#1e2a3a';

    if (storeSettings.logo_url) {
        document.getElementById('logoPreview').src = storeSettings.logo_url;
    }

    renderAdminBanners();
}

document.getElementById('setPrimaryColor').addEventListener('input', (e) => {
    document.getElementById('colorHexDisplay').textContent = e.target.value;
});

// Upload Help
async function uploadToSupabaseBucket(file) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabaseClient.storage
        .from('public-assets')
        .upload(filePath, file);

    if (uploadError) {
        throw new Error(uploadError.message || JSON.stringify(uploadError));
    }

    const { data } = supabaseClient.storage.from('public-assets').getPublicUrl(filePath);
    return data.publicUrl;
}

// Logo Upload
document.getElementById('logoInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        showToast('⏳ Fazendo upload da logo...');
        const publicUrl = await uploadToSupabaseBucket(file);
        storeSettings.logo_url = publicUrl;
        document.getElementById('logoPreview').src = publicUrl;
        showToast('✅ Logo pronta para salvar!');
    } catch (err) {
        showToast('❌ Erro: ' + (err.message || 'Falha no upload'));
        console.error(err);
    }
});

// Banners Logic
function renderAdminBanners() {
    const grid = document.getElementById('bannersGrid');
    const banners = storeSettings.banners || [];

    grid.innerHTML = banners.map((url, i) => `
        <div style="display: flex; gap: 10px; align-items: center; border: 1px solid #ddd; padding: 10px; border-radius: 6px;">
            <img src="${url}" style="height: 50px; width: 100px; object-fit: cover; border-radius: 4px;">
            <div style="flex:1; font-size: 0.8rem; color: #666; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${url}</div>
            <button type="button" class="btn-danger btn-sm" onclick="removeAdminBanner(${i})">Remover</button>
        </div>
    `).join('');

    const btnAdd = document.getElementById('btnAddBanner');
    if (banners.length >= 5) {
        btnAdd.style.display = 'none';
    } else {
        btnAdd.style.display = 'inline-block';
    }
}

window.removeAdminBanner = function (index) {
    storeSettings.banners.splice(index, 1);
    renderAdminBanners();
};

document.getElementById('bannerInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!storeSettings.banners) storeSettings.banners = [];
    if (storeSettings.banners.length >= 5) {
        showToast('Maximo 5 banners atingido.');
        return;
    }

    try {
        showToast('⏳ Fazendo upload do banner...');
        const publicUrl = await uploadToSupabaseBucket(file);
        storeSettings.banners.push(publicUrl);
        renderAdminBanners();
        showToast('✅ Banner adicionado!');
    } catch (err) {
        showToast('❌ Erro: ' + (err.message || 'Falha no upload'));
        console.error(err);
    }
});

// Save Settings
document.getElementById('formSettings').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!window.supabaseClient) {
        showToast('❌ Supabase não conectado');
        return;
    }

    const btn = document.getElementById('btnSaveSettings');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    storeSettings.whatsapp_number = document.getElementById('setWhatsapp').value.replace(/\D/g, '');
    storeSettings.primary_color = document.getElementById('setPrimaryColor').value;

    try {
        const { error } = await window.supabaseClient
            .from('store_settings')
            .update({
                whatsapp_number: storeSettings.whatsapp_number,
                primary_color: storeSettings.primary_color,
                logo_url: storeSettings.logo_url,
                banners: storeSettings.banners
            })
            .eq('id', 1);

        if (error) throw error;
        showToast('✅ Configurações salvas!');
    } catch (err) {
        console.error('Error saving settings:', err);
        showToast('❌ Erro: ' + (err.message || 'Erro ao salvar'));
    } finally {
        btn.disabled = false;
        btn.textContent = 'Salvar Configurações';
    }
});

// ── WHATSAPP OFFICIAL API SHARING ──────────────────────
window.promptAndSendWhatsApp = async function (productId) {
    // Wait, the productId is passed as argument
    const product = products.find(item => item.id === productId);
    if (!product) return;

    const phone = prompt("Digite o número do WhatsApp (com DDI e DDD, ex: 5515999999999):", "5515");
    if (!phone || phone.length < 10) {
        showToast("⚠️ Número inválido.");
        return;
    }

    showToast("⏳ Preparando anúncio...");

    try {
        const productUrl = `${window.location.origin}/index.html?p=${product.id}`;
        const productPrice = `R$ ${parseFloat(product.price).toFixed(2).replace('.', ',')}`;
        const productImage = product.images && product.images.length > 0 ? product.images[0] : (product.image || '');

        const response = await fetch('/api/send-whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone: phone.replace(/\D/g, ''),
                productName: product.name,
                productPrice: productPrice,
                productUrl: productUrl,
                productImage: productImage
            })
        });

        const result = await response.json();
        if (response.ok) {
            showToast("✅ Anúncio enviado com sucesso!");
        } else {
            showToast("❌ Erro: " + (result.error || "Falha ao enviar"));
        }
    } catch (err) {
        console.error(err);
        showToast("❌ Erro de conexão com o servidor.");
    }
};

// Intercept dashboard load to fetch settings
const originalShowDashboard = window.showDashboard;
window.showDashboard = function () {
    originalShowDashboard();
    loadSettings();
};
