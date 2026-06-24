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
let sales = []; // Relatórios de vendas de Mercado Pago

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
    } else if (viewId === 'view-reports') {
        loadSalesReport();
    }
}

function resetForm() {
    editingId = null;
    document.getElementById('formAd').reset();
    document.getElementById('view-create').querySelector('h1').textContent = 'Cadastrar Produto';
    document.getElementById('btnSubmit').textContent = 'Publicar Anúncio';

    imagesBase64 = new Array(10).fill(null);
    renderPhotoSlots();

    document.getElementById('adVideo').value = '';

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

window.triggerUrlUpload = async function (e, index) {
    e.stopPropagation();
    let url = prompt('Cole o endereço (URL) da imagem aqui:');
    if (!url) return;

    url = url.trim();
    if (url.startsWith('data:')) {
        imagesBase64[index] = url;
        renderPhotoSlots();
        return;
    }

    if (url.startsWith('http')) {
        if (url.includes('hwmdwlpmutuhrlcgssqw.supabase.co')) {
            imagesBase64[index] = url;
            renderPhotoSlots();
            return;
        }

        try {
            showToast('⏳ Processando imagem externa...');
            const response = await fetch(`/api/download-image?url=${encodeURIComponent(url)}`);
            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.error || 'Falha ao baixar imagem');
            }
            const data = await response.json();
            imagesBase64[index] = data.base64;
            renderPhotoSlots();
            showToast('✅ Imagem importada com sucesso!');
        } catch (err) {
            console.error(err);
            showToast('❌ Erro ao baixar imagem externa: ' + err.message);
        }
    } else {
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
    document.getElementById('adFitImage').checked = p.fit_image || false;
    document.getElementById('adVideo').value = p.video_url || '';

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

// Helper to convert dataURL to Blob
function dataURLtoBlob(dataurl) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}

document.getElementById('formAd').addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('btnSubmit');
    btn.disabled = true;
    btn.textContent = 'Salvando...';

    const finalImages = [];

    try {
        showToast('⏳ Processando imagens...');
        // Filtra apenas fotos preenchidas e faz o upload se forem base64 ou link externo
        for (let img of imagesBase64) {
            if (img === null) continue;

            if (img.startsWith('data:')) {
                // É um base64 novo, faz upload pro bucket
                const blob = dataURLtoBlob(img);
                // Cria um objeto "fake" de arquivo para o helper de upload
                const file = new File([blob], `produto_${Date.now()}.jpg`, { type: blob.type });
                const publicUrl = await uploadToSupabaseBucket(file);
                finalImages.push(publicUrl);
            } else if (img.startsWith('http') && !img.includes('hwmdwlpmutuhrlcgssqw.supabase.co')) {
                // É um link externo (como Mercado Livre). Vamos baixar e salvar no Supabase!
                try {
                    showToast('⏳ Importando link de imagem externo...');
                    const response = await fetch(`/api/download-image?url=${encodeURIComponent(img)}`);
                    if (!response.ok) {
                        throw new Error('Falha ao baixar imagem externa');
                    }
                    const data = await response.json();
                    const blob = dataURLtoBlob(data.base64);
                    const file = new File([blob], `produto_${Date.now()}.jpg`, { type: blob.type });
                    const publicUrl = await uploadToSupabaseBucket(file);
                    finalImages.push(publicUrl);
                } catch (err) {
                    console.error('Erro ao processar imagem externa:', err);
                    // Fallback: mantém a URL externa se falhar para não perder a foto
                    finalImages.push(img);
                }
            } else {
                // Já é uma URL hospedada no nosso Supabase
                finalImages.push(img);
            }
        }

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
            fit_image: document.getElementById('adFitImage').checked,
            video_url: document.getElementById('adVideo').value.trim(),
            images: finalImages,
            image: finalImages[0],
            variations: variations.filter(v => v.name.trim() !== ''),
            updated_at: new Date().toISOString()
        };

        if (editingId) {
            const { error } = await window.supabaseClient
                .from('products')
                .update(adData)
                .eq('id', editingId);

            if (error) throw error;
            showToast('✅ Atualizado!');
        } else {
            const id = 'prod-' + Date.now().toString(36);
            const { error } = await window.supabaseClient
                .from('products')
                .insert([{ id, ...adData, created_at: new Date().toISOString() }]);

            if (error) throw error;
            showToast('✅ Publicado!');
        }

        await loadProducts();
        switchView('view-list');
    } catch (err) {
        console.error('Erro ao salvar produto:', err);
        showToast('❌ Erro: ' + (err.message || 'Falha ao salvar.'));
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
    banners: [],
    payment_gateway: 'mercadopago',
    pagarme_api_key: ''
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
    document.getElementById('setPaymentGateway').value = storeSettings.payment_gateway || 'mercadopago';
    document.getElementById('setPagarmeApiKey').value = storeSettings.pagarme_api_key || '';

    togglePagarmeKeyVisibility(storeSettings.payment_gateway);

    if (storeSettings.logo_url) {
        document.getElementById('logoPreview').src = storeSettings.logo_url;
    }

    renderAdminBanners();
}

function togglePagarmeKeyVisibility(gateway) {
    const group = document.getElementById('groupPagarmeKey');
    if (group) {
        group.style.display = gateway === 'pagarme' ? 'block' : 'none';
    }
}

document.getElementById('setPaymentGateway').addEventListener('change', (e) => {
    togglePagarmeKeyVisibility(e.target.value);
});

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
    storeSettings.payment_gateway = document.getElementById('setPaymentGateway').value;
    storeSettings.pagarme_api_key = document.getElementById('setPagarmeApiKey').value;

    try {
        const { error } = await window.supabaseClient
            .from('store_settings')
            .update({
                whatsapp_number: storeSettings.whatsapp_number,
                primary_color: storeSettings.primary_color,
                logo_url: storeSettings.logo_url,
                banners: storeSettings.banners,
                payment_gateway: storeSettings.payment_gateway,
                pagarme_api_key: storeSettings.pagarme_api_key
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

// ── GRUPOS MANAGEMENT ──────────────────────────────
let groups = [];

async function loadGroups() {
    if (!window.supabaseClient) return;
    try {
        const { data, error } = await window.supabaseClient
            .from('whatsapp_groups')
            .select('*')
            .order('name', { ascending: true });
        if (error) throw error;
        groups = data || [];
        renderGroups(groups);
    } catch (err) {
        console.error('Erro ao carregar grupos:', err);
    }
}

function renderGroups(list) {
    const tbody = document.getElementById('groupsTbody');
    const empty = document.getElementById('emptyGroups');
    if (!tbody) return;

    if (list.length === 0) {
        tbody.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    tbody.innerHTML = list.map(g => `
        <tr>
            <td class="td-title">${g.name}</td>
            <td class="color-mute">${g.invite_url || '—'}</td>
            <td>
                <button class="btn-delete-contact" onclick="deleteGroup('${g.id}')" title="Excluir">🗑️</button>
            </td>
        </tr>
    `).join('');
}

function filterGroups() {
    const q = (document.getElementById('searchGroups')?.value || '').toLowerCase();
    const filtered = groups.filter(g => g.name.toLowerCase().includes(q));
    renderGroups(filtered);
}

function openAddGroupModal() {
    document.getElementById('groupName').value = '';
    document.getElementById('groupInvite').value = '';
    document.getElementById('addGroupModal').style.display = 'flex';
}

function closeAddGroupModal() {
    document.getElementById('addGroupModal').style.display = 'none';
}

async function saveGroup() {
    const name = document.getElementById('groupName').value.trim();
    const invite_url = document.getElementById('groupInvite').value.trim();

    if (!name) {
        showToast('⚠️ O nome do grupo é obrigatório.');
        return;
    }

    try {
        const { error } = await window.supabaseClient.from('whatsapp_groups').insert([{ name, invite_url }]);
        if (error) throw error;
        showToast('✅ Grupo salvo com sucesso!');
        closeAddGroupModal();
        await loadGroups();
    } catch (err) {
        showToast('❌ Erro ao salvar: ' + err.message);
    }
}

async function deleteGroup(id) {
    if (!confirm('Tem certeza que deseja excluir este grupo?')) return;
    try {
        const { error } = await window.supabaseClient.from('whatsapp_groups').delete().eq('id', id);
        if (error) throw error;
        showToast('🗑️ Grupo excluído.');
        await loadGroups();
    } catch (err) {
        showToast('❌ Erro ao excluir: ' + err.message);
    }
}

// ── CONTACTS MANAGEMENT ──────────────────────────────
let contacts = [];

async function loadContacts() {
    if (!window.supabaseClient) return;
    try {
        const { data, error } = await window.supabaseClient
            .from('contacts')
            .select('*')
            .order('name', { ascending: true });
        if (error) throw error;
        contacts = data || [];
        renderContacts(contacts);
    } catch (err) {
        console.error('Erro ao carregar contatos:', err);
    }
}

function renderContacts(list) {
    const tbody = document.getElementById('contactsTbody');
    const empty = document.getElementById('emptyContacts');
    if (!tbody) return;

    if (list.length === 0) {
        tbody.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    tbody.innerHTML = list.map(c => `
        <tr>
            <td class="td-title">${c.name}</td>
            <td>${c.phone}</td>
            <td class="color-mute">${c.notes || '—'}</td>
            <td>
                <button class="btn-delete-contact" onclick="deleteContact('${c.id}')" title="Excluir">🗑️</button>
            </td>
        </tr>
    `).join('');
}

function filterContacts() {
    const q = (document.getElementById('searchContacts')?.value || '').toLowerCase();
    const filtered = contacts.filter(c =>
        c.name.toLowerCase().includes(q) || c.phone.includes(q)
    );
    renderContacts(filtered);
}

function openAddContactModal() {
    document.getElementById('contactName').value = '';
    document.getElementById('contactPhone').value = '';
    document.getElementById('contactNotes').value = '';
    document.getElementById('addContactModal').style.display = 'flex';
}

function closeAddContactModal() {
    document.getElementById('addContactModal').style.display = 'none';
}

// EXCEL / CSV / TXT IMPORT
async function importCSV(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        showToast('⏳ Processando planilha...');
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Puxa como objetos: [{ "Nome Cliente": "Pedro", "Celular": "119999" }]
        const rows = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
        
        const newContacts = [];
        let skipped = 0;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            
            // Pega todos os valores da linha como array de strings limpos
            let cellValues = Object.values(row).map(v => (v || '').toString().trim().replace(/\0/g, ''));
            
            // 1. Procura o Telefone: qualquer célula que tenha entre 8 e 15 números
            let phoneVal = cellValues.find(v => {
                let digits = v.replace(/\D/g, '');
                return digits.length >= 8 && digits.length <= 15;
            });

            // 2. Procura o Nome: primeira célula com texto não-vazio que não seja o próprio telefone
            let nameVal = cellValues.find(v => v !== phoneVal && v.length > 1 && isNaN(v));

            // 3. Procura Observação: qualquer texto restante
            let noteVal = cellValues.find(v => v !== phoneVal && v !== nameVal && v.length > 0);

            let name = nameVal || 'Contato ' + (i + 1);
            let phone = (phoneVal || '').replace(/\D/g, '');
            const notes = noteVal || '';

            // Ignora se não achou telefone
            if (!phone) { skipped++; continue; }
            if (name.toLowerCase() === 'nome' || name.toLowerCase() === 'cliente') { skipped++; continue; } // Ignora cabeçalhos que se passarem por nomes

            // Adiciona código do pais
            if (phone.length === 10 || phone.length === 11) {
                phone = '55' + phone;
            }

            newContacts.push({ name, phone, notes });
        }

        if (newContacts.length === 0) {
            showToast('⚠️ Não encontramos nenhum número de telefone válido na sua planilha!');
            event.target.value = '';
            return;
        }

        const { error } = await window.supabaseClient.from('contacts').insert(newContacts);
        if (error) throw error;
        showToast(`✅ ${newContacts.length} contato(s) importado(s)!` + (skipped ? ` (${skipped} linha(s) ignorada(s))` : ''));
        await loadContacts();
    } catch (err) {
        console.error('Erro na leitura da planilha:', err);
        showToast('❌ Erro no arquivo. Tente salvar a planilha como CSV (.csv) e importar novamente.');
    }

    event.target.value = '';
}

async function deleteAllContacts() {
    if (contacts.length === 0) {
        showToast('A lista já está vazia.');
        return;
    }
    
    if (!confirm('Você tem ABSOLUTA CERTEZA que quer apagar TODOS os contatos salvos? Essa ação não pode ser desfeita.')) return;
    
    // Segunda confirmação de segurança
    const confirmText = prompt('Digite "APAGAR" para confirmar a exclusão de todos os contatos:');
    if (confirmText !== 'APAGAR') {
        showToast('Exclusão cancelada.');
        return;
    }

    try {
        const btn = document.querySelector('button[onclick="deleteAllContacts()"]');
        if(btn) btn.textContent = "⏳ Apagando...";
        
        // Pega todos os IDs válidos em memória para apagar com segurança
        const idsToDelete = contacts.map(c => c.id);
        
        // Divide em lotes caso tenha muitos contatos
        const chunkSize = 100;
        for (let i = 0; i < idsToDelete.length; i += chunkSize) {
            const chunk = idsToDelete.slice(i, i + chunkSize);
            const { error } = await window.supabaseClient.from('contacts').delete().in('id', chunk);
            if (error) throw error;
        }
        
        showToast('🗑️ Todos os contatos foram limpos!');
        await loadContacts();
        
        if(btn) btn.innerHTML = "🗑️ Apagar Todos";
    } catch (err) {
        console.error('Erro detalhado:', err);
        showToast('❌ Erro ao apagar contatos. Veja o console.');
        const btn = document.querySelector('button[onclick="deleteAllContacts()"]');
        if(btn) btn.innerHTML = "🗑️ Apagar Todos";
    }
}

async function saveContact() {
    const name = document.getElementById('contactName').value.trim();
    let phone = document.getElementById('contactPhone').value.trim().replace(/\D/g, '');
    const notes = document.getElementById('contactNotes').value.trim();

    if (!name || !phone) {
        showToast('⚠️ Nome e telefone são obrigatórios.');
        return;
    }

    // Auto-add country code
    if (phone.length === 10 || phone.length === 11) {
        phone = '55' + phone;
    }

    try {
        const { error } = await window.supabaseClient.from('contacts').insert([{ name, phone, notes }]);
        if (error) throw error;
        showToast('✅ Contato salvo com sucesso!');
        closeAddContactModal();
        await loadContacts();
    } catch (err) {
        showToast('❌ Erro ao salvar: ' + err.message);
    }
}

async function deleteContact(id) {
    if (!confirm('Tem certeza que deseja excluir este contato?')) return;
    try {
        const { error } = await window.supabaseClient.from('contacts').delete().eq('id', id);
        if (error) throw error;
        showToast('🗑️ Contato excluído.');
        await loadContacts();
    } catch (err) {
        showToast('❌ Erro ao excluir: ' + err.message);
    }
}

let selectedGroups = [];
let selectedPhones = [];
let currentSendProductId = null;

window.promptAndSendWhatsApp = function (productId) {
    currentSendProductId = productId;
    selectedPhones = [];
    selectedGroups = [];

    const product = products.find(item => item.id === productId);
    if (!product) return;

    // Set title
    document.getElementById('whatsappProductName').textContent = product.name;

    // Populate contact and group dropdown
    const select = document.getElementById('contactSelect');
    select.innerHTML = '<option value="">-- Escolher contato ou grupo --</option>';
    
    // Optgroups for clarity
    let optHtml = '';
    
    if (contacts.length > 0) {
        optHtml += '<optgroup label="Contatos (WhatsApp Web/App)">';
        contacts.forEach(c => {
            optHtml += `<option value="tel:${c.phone}">${c.name} (${c.phone})</option>`;
        });
        optHtml += '</optgroup>';
    }

    if (groups.length > 0) {
        optHtml += '<optgroup label="Grupos (Compartilhamento Link)">';
        groups.forEach(g => {
            optHtml += `<option value="group:${g.id}">${g.name}</option>`;
        });
        optHtml += '</optgroup>';
    }

    select.innerHTML += optHtml;

    // Reset
    document.getElementById('manualPhone').value = '';
    document.getElementById('selectedContactsList').innerHTML = '';
    
    // Reset buttons visibility
    const sendBtn = document.getElementById('btnSendWhatsApp');
    if (sendBtn) sendBtn.style.display = 'block';
    const helloBtn = document.getElementById('btnSendHelloWorld');
    if (helloBtn) helloBtn.style.display = 'block';

    document.getElementById('whatsappModal').style.display = 'flex';
};

function closeWhatsAppModal() {
    document.getElementById('whatsappModal').style.display = 'none';
    currentSendProductId = null;
    selectedPhones = [];
    selectedGroups = [];
}

function onContactSelect() {
    const select = document.getElementById('contactSelect');
    const value = select.value; // "tel:..." or "group:..."
    if (!value) return;

    if (value.startsWith('tel:')) {
        const phone = value.replace('tel:', '');
        if (!selectedPhones.includes(phone)) {
            selectedPhones.push(phone);
        }
    } else if (value.startsWith('group:')) {
        const groupId = value.replace('group:', '');
        if (!selectedGroups.includes(groupId)) {
            selectedGroups.push(groupId);
        }
    }

    renderSelectedBadges();
    select.value = '';
}

function renderSelectedBadges() {
    const container = document.getElementById('selectedContactsList');
    if (selectedPhones.length === 0 && selectedGroups.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    let html = '<label style="font-size:.85rem; color:#999; display:block; margin-bottom:6px;">Enviar para:</label>';
    
    // Render Contacts
    if (selectedPhones.length > 20) {
        html += `<span class="contact-badge" style="background:#fff3cd; color:#856404; font-weight:600;">📱 ${selectedPhones.length} Contatos Selecionados <span class="remove-badge" onclick="removeAllSelectedPhones()">&times;</span></span>`;
    } else {
        html += selectedPhones.map(phone => {
            const c = contacts.find(x => x.phone === phone);
            const name = c ? c.name : phone;
            return `<span class="contact-badge">${name} <span class="remove-badge" onclick="removeSelectedPhone('${phone}')">&times;</span></span>`;
        }).join('');
    }

    // Render Groups
    html += selectedGroups.map(gid => {
        const g = groups.find(x => x.id == gid);
        const name = g ? g.name : 'Grupo';
        return `<span class="contact-badge" style="background:#e0f7fa; color:#006064;">👥 ${name} <span class="remove-badge" onclick="removeSelectedGroup('${gid}')">&times;</span></span>`;
    }).join('');

    container.innerHTML = html;
}

window.selectAllContactsForBlast = function() {
    if (contacts.length === 0) {
        showToast('Nenhum contato na agenda.');
        return;
    }
    
    contacts.forEach(c => {
        if (!selectedPhones.includes(c.phone)) {
            selectedPhones.push(c.phone);
        }
    });
    
    renderSelectedBadges();
};

window.removeAllSelectedPhones = function() {
    selectedPhones = [];
    renderSelectedBadges();
};

function removeSelectedPhone(phone) {
    selectedPhones = selectedPhones.filter(p => p !== phone);
    renderSelectedBadges();
}

function removeSelectedGroup(gid) {
    selectedGroups = selectedGroups.filter(id => id != gid);
    renderSelectedBadges();
}

async function sendWhatsAppFromModal() {
    const manualPhone = document.getElementById('manualPhone').value.trim().replace(/\D/g, '');

    // Collect all phones to send
    const phonesToSend = [...selectedPhones];
    if (manualPhone) {
        let formatted = manualPhone;
        if (formatted.length === 10 || formatted.length === 11) {
            formatted = '55' + formatted;
        }
        if (!phonesToSend.includes(formatted)) {
            phonesToSend.push(formatted);
        }
    }

    if (phonesToSend.length === 0 && selectedGroups.length === 0) {
        showToast('⚠️ Selecione um contato, grupo ou digite um número.');
        return;
    }

    const product = products.find(item => item.id === currentSendProductId);
    if (!product) return;

    const productUrl = `${window.location.origin}/api/share?id=${product.id}`;
    const productPriceStr = 'R$ ' + parseFloat(product.price).toFixed(2).replace('.', ',');
    const shareText = `🔥 *OFERTA IMPERDÍVEL!* 🔥\n\n*${product.name}*\n💰 Por apenas *${productPriceStr}*\n\n👉 Confira os detalhes e compre aqui:\n${productUrl}`;
    const encodedText = encodeURIComponent(shareText);

    // Se for exatamente 1 alvo (contato ou grupo), abre direto e fecha o modal
    if (phonesToSend.length + selectedGroups.length === 1) {
        if (phonesToSend.length === 1) {
            const phone = phonesToSend[0];
            window.open(`https://api.whatsapp.com/send?phone=${phone}&text=${encodedText}`, '_blank');
        } else {
            // Grupo
            window.open(`https://wa.me/?text=${encodedText}`, '_blank');
        }
        showToast('✅ Abrindo WhatsApp...');
        closeWhatsAppModal();
        return;
    }

    // Se forem múltiplos alvos, exibimos uma lista de botões no próprio modal para evitar bloqueio de popups
    const container = document.getElementById('selectedContactsList');
    let html = `
        <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; margin-top: 15px; border: 1px solid #333;">
            <label style="font-size: .85rem; font-weight: bold; color: var(--primary); display: block; margin-bottom: 8px;">
                📲 Envio Manual (Clique em cada um para enviar):
            </label>
            <div style="display: flex; flex-direction: column; gap: 8px; max-height: 200px; overflow-y: auto; padding-right: 4px;">
    `;

    // Botões para contatos
    phonesToSend.forEach((phone) => {
        const c = contacts.find(x => x.phone === phone);
        const name = c ? c.name : phone;
        html += `
            <button type="button" class="btn-manual-send" onclick="triggerManualSendPhone(this, '${phone}', '${encodedText}')" 
                    style="display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 8px 12px; background: #222; color: #fff; border: 1px solid #444; border-radius: 6px; cursor: pointer; text-align: left; font-size: 0.85rem; transition: all 0.2s;">
                <span>👤 ${name}</span>
                <span class="send-status-icon" style="color: #25d366; font-weight: bold;">Enviar ➔</span>
            </button>
        `;
    });

    // Botões para grupos
    selectedGroups.forEach((gid) => {
        const g = groups.find(x => x.id == gid);
        const name = g ? g.name : 'Grupo';
        html += `
            <button type="button" class="btn-manual-send" onclick="triggerManualSendGroup(this, '${encodedText}')"
                    style="display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 8px 12px; background: #222; color: #fff; border: 1px solid #444; border-radius: 6px; cursor: pointer; text-align: left; font-size: 0.85rem; transition: all 0.2s;">
                <span>👥 ${name}</span>
                <span class="send-status-icon" style="color: #00bcd4; font-weight: bold;">Compartilhar ➔</span>
            </button>
        `;
    });

    html += `
            </div>
        </div>
    `;

    container.innerHTML = html;
    showToast('💡 Clique nos botões acima para enviar para cada contato.');
    
    // Oculta os botões principais de envio oficial/hello world para limpar a tela
    document.getElementById('btnSendWhatsApp').style.display = 'none';
    const helloBtn = document.getElementById('btnSendHelloWorld');
    if (helloBtn) helloBtn.style.display = 'none';
}

// Funções globais executadas quando o usuário clica nos botões de disparo manual
window.triggerManualSendPhone = function(btn, phone, encodedText) {
    window.open(`https://api.whatsapp.com/send?phone=${phone}&text=${encodedText}`, '_blank');
    btn.style.background = '#1a3322';
    btn.style.borderColor = '#25d366';
    btn.querySelector('.send-status-icon').textContent = '✅ Aberto';
    btn.querySelector('.send-status-icon').style.color = '#888';
};

window.triggerManualSendGroup = function(btn, encodedText) {
    window.open(`https://wa.me/?text=${encodedText}`, '_blank');
    btn.style.background = '#112d32';
    btn.style.borderColor = '#00bcd4';
    btn.querySelector('.send-status-icon').textContent = '✅ Aberto';
    btn.querySelector('.send-status-icon').style.color = '#888';
};

window.sendHelloWorldTest = async function() {
    const manualPhone = document.getElementById('manualPhone').value.trim().replace(/\D/g, '');
    let phone = manualPhone;
    if (phone.length === 10 || phone.length === 11) phone = '55' + phone;

    if (!phone) {
        showToast('⚠️ Digite um número para testar.');
        return;
    }

    const btn = document.getElementById('btnSendHelloWorld');
    if(btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Testando...';
    }

    try {
        const response = await fetch('/api/send-whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                phone,
                templateName: 'hello_world',
                productName: 'Teste',
                productPrice: '0,00',
                productUrl: 'https://google.com'
            })
        });
        const resultData = await response.json();
        console.log(`[META DEBUG TEST]`, resultData);
        if (response.ok) showToast('✅ Teste enviado! Verifique o WhatsApp.');
        else showToast('❌ Erro no teste: ' + resultData.error);
    } catch (err) {
        showToast('❌ Falha na conexão.');
    } finally {
        if(btn) {
            btn.disabled = false;
            btn.textContent = '🧪 Testar com Hello World';
        }
    }
}

// Intercept dashboard load to fetch settings
const originalShowDashboard = window.showDashboard;
window.showDashboard = function () {
    originalShowDashboard();
    loadSettings();
    loadContacts();
    loadGroups();
    initMobileSidebar();
};

function initMobileSidebar() {
    const menuToggleBtn = document.getElementById('menuToggleBtn');
    const sidebar = document.querySelector('.sidebar');
    const backdrop = document.getElementById('sidebarBackdrop');

    if (menuToggleBtn && sidebar && backdrop) {
        menuToggleBtn.onclick = function() {
            sidebar.classList.toggle('active');
            backdrop.classList.toggle('active');
        };

        backdrop.onclick = function() {
            sidebar.classList.remove('active');
            backdrop.classList.remove('active');
        };

        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                sidebar.classList.remove('active');
                backdrop.classList.remove('active');
            });
        });
    }
}

// ── SALES REPORTS MANAGEMENT ──────────────────────────
async function loadSalesReport() {
    showToast('⏳ Carregando vendas...');
    try {
        const response = await fetch(`/api/sales-report?password=${encodeURIComponent(CONFIG.adminPassword)}`);
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Falha ao carregar vendas');
        }
        const data = await response.json();
        sales = data.sales || [];
        renderSalesReport();
    } catch (err) {
        console.error('Erro ao carregar relatório:', err);
        showToast('❌ Erro: ' + err.message);
    }
}

function renderSalesReport(list = null) {
    const tbody = document.getElementById('reportsTbody');
    const empty = document.getElementById('emptyReports');
    if (!tbody) return;

    const dataToRender = list !== null ? list : sales;
    updateReportStats(dataToRender);

    if (dataToRender.length === 0) {
        tbody.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    tbody.innerHTML = dataToRender.map(s => {
        return `
            <tr>
                <td>
                    <div style="font-weight: 500;">${formatDate(s.date)}</div>
                    <div style="font-size: 0.75rem; color: #999;">ID: ${s.id}</div>
                </td>
                <td>
                    <div style="font-weight: 500;">${s.customerName}</div>
                    <div style="font-size: 0.75rem; color: #666;">${s.customerPhone}</div>
                </td>
                <td>
                    <div class="td-title">${s.productName}</div>
                    <div class="td-desc">REF: #${s.reference}</div>
                </td>
                <td style="font-weight: 600;">R$ ${parseFloat(s.amount).toFixed(2).replace('.', ',')}</td>
                <td>
                    <span style="font-size: 0.85rem; font-weight: 500;">
                        ${getPaymentMethodText(s.paymentMethod)}
                    </span>
                </td>
                <td>
                    <span class="badge ${getStatusBadgeClass(s.status)}">
                        ${getStatusText(s.status)}
                    </span>
                </td>
                <td>
                    <button class="btn-primary btn-sm" onclick="viewSaleDetails('${s.id}')" style="padding: 4px 8px; font-size: 0.8rem;">
                        Detalhes
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

window.filterReports = function() {
    const q = (document.getElementById('searchReports')?.value || '').toLowerCase().trim();
    const statusFilter = document.getElementById('filterReportStatus')?.value || 'all';
    const startDateVal = document.getElementById('filterReportStartDate')?.value || '';
    const endDateVal = document.getElementById('filterReportEndDate')?.value || '';

    const filtered = sales.filter(s => {
        const matchSearch = !q || 
            s.customerName.toLowerCase().includes(q) || 
            s.customerPhone.includes(q) || 
            s.productName.toLowerCase().includes(q) || 
            s.id.toString().includes(q) || 
            s.reference.toLowerCase().includes(q);

        let matchStatus = true;
        if (statusFilter === 'approved') {
            matchStatus = s.status === 'approved';
        } else if (statusFilter === 'pending') {
            matchStatus = s.status === 'pending' || s.status === 'in_process';
        } else if (statusFilter === 'rejected') {
            matchStatus = s.status === 'rejected' || s.status === 'cancelled';
        }

        let matchDate = true;
        if (s.date) {
            const saleDate = new Date(s.date);
            if (startDateVal) {
                const startDate = new Date(startDateVal + 'T00:00:00');
                if (saleDate < startDate) matchDate = false;
            }
            if (endDateVal) {
                const endDate = new Date(endDateVal + 'T23:59:59');
                if (saleDate > endDate) matchDate = false;
            }
        } else if (startDateVal || endDateVal) {
            matchDate = false;
        }

        return matchSearch && matchStatus && matchDate;
    });

    renderSalesReport(filtered);
};

function updateReportStats(list) {
    let totalApproved = 0;
    let approvedCount = 0;
    let totalPending = 0;

    list.forEach(s => {
        const amt = parseFloat(s.amount) || 0;
        if (s.status === 'approved') {
            totalApproved += amt;
            approvedCount++;
        } else if (s.status === 'pending' || s.status === 'in_process') {
            totalPending += amt;
        }
    });

    document.getElementById('statTotalApproved').textContent = 'R$ ' + totalApproved.toFixed(2).replace('.', ',');
    document.getElementById('statTotalCount').textContent = approvedCount.toString();
    document.getElementById('statTotalPending').textContent = 'R$ ' + totalPending.toFixed(2).replace('.', ',');
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
        return dateStr;
    }
}

function getStatusBadgeClass(status) {
    switch (status) {
        case 'approved': return 'badge-approved';
        case 'pending':
        case 'in_process': return 'badge-pending';
        case 'rejected':
        case 'cancelled': return 'badge-rejected';
        default: return 'badge-neutral';
    }
}

function getStatusText(status) {
    switch (status) {
        case 'approved': return 'Aprovado';
        case 'pending': return 'Pendente';
        case 'in_process': return 'Em Análise';
        case 'rejected': return 'Rejeitado';
        case 'cancelled': return 'Cancelado';
        default: return status || 'Outro';
    }
}

function getPaymentMethodText(method) {
    if (!method) return 'Não informado';
    const m = method.toLowerCase();
    switch (m) {
        case 'account_money': return 'Saldo Mercado Pago';
        case 'pix': return 'PIX';
        case 'credit_card': return 'Cartão de Crédito';
        case 'debit_card': return 'Cartão de Débito';
        case 'ticket':
        case 'bolbradesco': return 'Boleto Bancário';
        default: return method.toUpperCase();
    }
}

window.viewSaleDetails = function(id) {
    const sale = sales.find(s => s.id == id);
    if (!sale) return;

    const modal = document.getElementById('saleDetailsModal');
    document.getElementById('invoiceRef').textContent = `ID MP: ${sale.id} | REF: ${sale.reference}`;

    const infoHtml = `
        <div class="invoice-section">
            <h4>Dados do Cliente</h4>
            <p><strong>Nome:</strong> ${sale.customerName}</p>
            <p><strong>E-mail:</strong> ${sale.customerEmail}</p>
            <p><strong>Telefone:</strong> ${sale.customerPhone}</p>
        </div>
        <hr class="invoice-divider">
        <div class="invoice-section">
            <h4>Detalhes da Compra</h4>
            <p><strong>Produto:</strong> ${sale.productName}</p>
            <p><strong>Valor:</strong> R$ ${parseFloat(sale.amount).toFixed(2).replace('.', ',')}</p>
            <p><strong>Forma de Pagamento:</strong> ${getPaymentMethodText(sale.paymentMethod)}</p>
            <p><strong>Data/Hora:</strong> ${formatDate(sale.date)}</p>
            <p><strong>Status:</strong> <span class="badge ${getStatusBadgeClass(sale.status)}">${getStatusText(sale.status)}</span></p>
        </div>
        <hr class="invoice-divider">
        <div class="invoice-section">
            <h4>Entrega / Observações</h4>
            <p>${sale.deliveryInfo || 'Não informado'}</p>
        </div>
    `;

    document.getElementById('invoiceContent').innerHTML = infoHtml;
    modal.style.display = 'flex';
};

window.closeSaleDetailsModal = function() {
    document.getElementById('saleDetailsModal').style.display = 'none';
};

window.printInvoice = function() {
    document.body.classList.add('printing-invoice');
    window.print();
    setTimeout(() => {
        document.body.classList.remove('printing-invoice');
    }, 500);
};

window.printReports = function() {
    window.print();
};

window.exportReportsToExcel = function() {
    if (sales.length === 0) {
        showToast('⚠️ Nenhuma venda disponível para exportar.');
        return;
    }

    try {
        showToast('⏳ Gerando planilha Excel...');
        const rows = sales.map(s => ({
            'ID Transação': s.id,
            'Data/Hora': formatDate(s.date),
            'Cliente': s.customerName,
            'Telefone': s.customerPhone,
            'E-mail': s.customerEmail,
            'Produto': s.productName,
            'Valor (R$)': parseFloat(s.amount),
            'Forma de Pagamento': getPaymentMethodText(s.paymentMethod),
            'Status': getStatusText(s.status),
            'Referência': s.reference,
            'Entrega / Observações': s.deliveryInfo
        }));

        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Vendas');

        // Autowidth columns
        const maxLens = {};
        rows.forEach(row => {
            Object.keys(row).forEach(key => {
                const valStr = (row[key] || '').toString();
                maxLens[key] = Math.max(maxLens[key] || 10, valStr.length);
            });
        });
        worksheet['!cols'] = Object.keys(maxLens).map(key => ({ wch: maxLens[key] + 3 }));

        XLSX.writeFile(workbook, `Relatorio_Vendas_${new Date().toISOString().slice(0, 10)}.xlsx`);
        showToast('✅ Planilha gerada com sucesso!');
    } catch (err) {
        console.error('Erro ao exportar Excel:', err);
        showToast('❌ Falha ao exportar Excel: ' + err.message);
    }
};
