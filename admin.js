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
        // Filtra apenas fotos preenchidas e faz o upload se forem base64
        for (let img of imagesBase64) {
            if (img === null) continue;

            if (img.startsWith('data:')) {
                // É um base64 novo, faz upload pro bucket
                const blob = dataURLtoBlob(img);
                // Cria um objeto "fake" de arquivo para o helper de upload
                const file = new File([blob], `produto_${Date.now()}.jpg`, { type: blob.type });
                const publicUrl = await uploadToSupabaseBucket(file);
                finalImages.push(publicUrl);
            } else {
                // Já é uma URL (ex: editando produto existente)
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

// CSV / TXT IMPORT
async function importCSV(event) {
    const file = event.target.files[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim());

    // Detect separator: ; or , or tab
    const sep = lines[0].includes(';') ? ';' : (lines[0].includes('\t') ? '\t' : ',');

    const newContacts = [];
    let skipped = 0;

    for (const line of lines) {
        const parts = line.split(sep).map(s => s.trim().replace(/^["']|["']$/g, ''));
        if (parts.length < 2) { skipped++; continue; }

        const name = parts[0];
        let phone = parts[1].replace(/\D/g, '');

        // Skip header rows
        if (!phone || isNaN(phone) || name.toLowerCase() === 'nome') { skipped++; continue; }

        // Auto-add country code
        if (phone.length === 10 || phone.length === 11) {
            phone = '55' + phone;
        }

        const notes = parts[2] || '';
        newContacts.push({ name, phone, notes });
    }

    if (newContacts.length === 0) {
        showToast('⚠️ Nenhum contato válido encontrado. Use o formato: Nome;Telefone');
        event.target.value = '';
        return;
    }

    try {
        const { error } = await window.supabaseClient.from('contacts').insert(newContacts);
        if (error) throw error;
        showToast(`✅ ${newContacts.length} contato(s) importado(s)!` + (skipped ? ` (${skipped} linha(s) ignorada(s))` : ''));
        await loadContacts();
    } catch (err) {
        showToast('❌ Erro ao importar: ' + err.message);
    }

    event.target.value = '';
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

// ── WHATSAPP SEND MODAL ──────────────────────────────
let selectedGroups = [];

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
        optHtml += '<optgroup label="Contatos (Envio Automático)">';
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
    html += selectedPhones.map(phone => {
        const c = contacts.find(x => x.phone === phone);
        const name = c ? c.name : phone;
        return `<span class="contact-badge">${name} <span class="remove-badge" onclick="removeSelectedPhone('${phone}')">&times;</span></span>`;
    }).join('');

    // Render Groups
    html += selectedGroups.map(gid => {
        const g = groups.find(x => x.id == gid);
        const name = g ? g.name : 'Grupo';
        return `<span class="contact-badge" style="background:#e0f7fa; color:#006064;">👥 ${name} <span class="remove-badge" onclick="removeSelectedGroup('${gid}')">&times;</span></span>`;
    }).join('');

    container.innerHTML = html;
}

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

    const btn = document.getElementById('btnSendWhatsApp');
    btn.disabled = true;
    btn.textContent = '⏳ Enviando...';

    const productUrl = `${window.location.origin}/api/share?id=${product.id}`;
    const productPrice = `R$ ${parseFloat(product.price).toFixed(2).replace('.', ',')}`;
    const productImage = product.images && product.images.length > 0 ? product.images[0] : (product.image || '');
    
    // Handle Individual Contacts (Official API)
    let successCount = 0;
    let failCount = 0;

    if (phonesToSend.length > 0) {
        for (const phone of phonesToSend) {
            try {
                const response = await fetch('/api/send-whatsapp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        phone,
                        productName: product.name,
                        productPrice,
                        productUrl,
                        productImage
                    })
                });
                if (response.ok) successCount++;
                else failCount++;
            } catch (err) {
                failCount++;
            }
        }
    }

    // Handle Groups (Manual Share Link)
    if (selectedGroups.length > 0) {
        const shareText = `🔥 *OFERTA IMPERDÍVEL!* 🔥\n\n*${product.name}*\n💰 Por apenas *${productPrice}*\n\n👉 Confira os detalhes e compre aqui:\n${productUrl}`;
        const encodedText = encodeURIComponent(shareText);
        
        // Open the first group in a new tab (or just open the share window)
        // Since we can't open multiple tabs safely without being blocked, we'll open a general share if multiple or the specific group if one.
        window.open(`https://wa.me/?text=${encodedText}`, '_blank');
        successCount += selectedGroups.length;
    }

    btn.disabled = false;
    btn.textContent = '📤 Enviar / Compartilhar';

    if (failCount === 0) {
        showToast(`✅ Operação concluída para ${successCount} alvo(s)!`);
        closeWhatsAppModal();
    } else {
        showToast(`⚠️ ${successCount} enviado(s), ${failCount} falha(s).`);
    }
}

// Intercept dashboard load to fetch settings
const originalShowDashboard = window.showDashboard;
window.showDashboard = function () {
    originalShowDashboard();
    loadSettings();
    loadContacts();
    loadGroups();
};
