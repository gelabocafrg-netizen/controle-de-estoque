import { db } from './db.js';

let products = [];
let currentFilter = 'all';
let searchTerm = '';
let searchTermIfood = '';
let currentEditId = null;
let currentTab = 'estoque'; // 'estoque' or 'ifood'

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    setupEventListeners();
    await loadData();
});

// Theme Management
function initTheme() {
    const isDark = localStorage.getItem('pro_theme') === 'dark';
    if (isDark) {
        document.body.classList.add('dark-mode');
        document.getElementById('theme-icon').className = 'fas fa-sun';
    }
}

window.toggleTheme = () => {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('pro_theme', isDark ? 'dark' : 'light');
    document.getElementById('theme-icon').className = isDark ? 'fas fa-sun' : 'fas fa-moon';
};

// Data Loading
async function loadData() {
    try {
        updateConnectionStatus('Carregando...', 'info');
        products = await db.getProducts();

        // Ensure old local data has ifood_status mapped
        products = products.map(p => ({
            ...p,
            ifood_status: p.ifood_status !== false // default to true if undefined
        }));

        updateConnectionStatus(db.isSupabase ? 'Online (Supabase)' : 'Online (Local)', 'success');
        render();
        updateStats();
    } catch (error) {
        console.error("Error loading products:", error);
        updateConnectionStatus('Erro ao carregar', 'error');
        showToast('Erro', 'Não foi possível carregar os produtos.', 'error');
    }
}

function updateConnectionStatus(text, status) {
    const el = document.getElementById('connectionStatus');
    el.innerHTML = `<i class="${status === 'success' ? 'fas fa-wifi' : status === 'info' ? 'fas fa-sync fa-spin' : 'fas fa-unlink'}"></i> ${text}`;
    el.className = `status-connection ${status === 'error' ? 'offline' : ''}`;
}

// Helpers
function getProductStatus(product) {
    const b = parseInt(product.boxes) || 0;
    const mb = parseInt(product.min_boxes) || 0;

    if (b <= 0) return { label: 'ESGOTADO', class: 'status-danger' };
    if (b <= mb) return { label: 'BAIXO', class: 'status-warning' };
    return { label: 'OK', class: 'status-ok' };
}

// Rendering
window.switchTab = (tab) => {
    currentTab = tab;
    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');

    // Update views
    document.querySelectorAll('.view-section').forEach(view => {
        view.classList.remove('active');
        view.style.display = 'none';
    });
    const activeView = document.getElementById(`view-${tab}`);
    activeView.classList.add('active');
    activeView.style.display = 'block';

    render();
};

function render() {
    if (currentTab === 'estoque') {
        renderEstoque();
    } else {
        renderIfood();
    }
}

function renderEstoque() {
    const container = document.getElementById('gridContainer');
    container.innerHTML = '';

    let filtered = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchTerm) || p.cat.toLowerCase().includes(searchTerm);
        if (!matchesSearch) return false;

        const b = parseInt(p.boxes) || 0;
        const u = parseInt(p.units) || 0;
        const mb = parseInt(p.min_boxes) || 0;

        if (currentFilter === 'low') return b <= mb;
        if (currentFilter === 'ok') return b > mb;
        return true;
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-box-open"></i>
                <h3>Nenhum produto encontrado</h3>
                <p>Nesta categoria ou busca atual.</p>
            </div>
        `;
        return;
    }

    // Group by category
    const grouped = filtered.reduce((acc, p) => {
        if (!acc[p.cat]) acc[p.cat] = [];
        acc[p.cat].push(p);
        return acc;
    }, {});

    Object.keys(grouped).sort().forEach(category => {
        const items = grouped[category].sort((a, b) => a.name.localeCompare(b.name));

        const card = document.createElement('div');
        card.className = 'category-card';

        let itemsHtml = items.map(p => {
            const status = getProductStatus(p);
            // Progress based on boxes (max 100% assuming ~ 3x min_boxes is a full bar)
            const percent = Math.min(100, Math.max(0, (p.boxes / ((p.min_boxes * 3) || 5)) * 100));
            const progressColor = p.boxes <= p.min_boxes ? 'var(--danger)' : 'var(--success)';

            return `
                <li class="item-row">
                    <div class="item-row-header" onclick="toggleRowAccordion('${p.id}')">
                        <div class="item-info">
                            <span class="item-name">${p.name} <i class="fas fa-chevron-down" style="font-size: 0.8em; margin-left: 5px; color: var(--text-muted);"></i></span>
                            <div class="item-stock-details">
                                <span class="qty-badge" title="Caixas Fechadas"><i class="fas fa-box"></i> ${p.boxes} </span>
                                <span class="qty-badge" title="Caixas Abertas"><i class="fas fa-box-open"></i> ${p.units} </span>
                                <span class="qty-badge" style="opacity: 0.7;" title="Caixas Mínimas">Min: ${p.min_boxes}cx</span>
                            </div>
                        </div>
                        <div class="actions" onclick="event.stopPropagation()">
                            <span class="status-badge ${status.class}">${status.label}</span>
                            <button class="icon-btn delete" onclick="deleteProduct('${p.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                    
                    <!-- Inline Accordion Edit Form (Hidden by default) -->
                    <div id="accordion-${p.id}" class="accordion-content" style="max-height: 0; margin-top: 0; margin-bottom: 0; width: 100%; border: none; box-shadow: none;">
                        <div class="inline-edit-form">
                            <form onsubmit="event.preventDefault(); saveProduct('${p.id}');">
                                <div class="form-row">
                                    <div class="form-group">
                                        <label>Nome do Produto</label>
                                        <input type="text" id="edit-name-${p.id}" class="form-control" value="${p.name}" required>
                                    </div>
                                    <div class="form-group">
                                        <label>Categoria</label>
                                        <select id="edit-cat-${p.id}" class="form-control" required>
                                            <option value="${p.cat}" selected>${p.cat}</option>
                                            <!-- Outras categorias setadas via JS se precisar, mas mantemos simples aqui -->
                                        </select>
                                    </div>
                                </div>
                                <div class="form-row">
                                    <div class="form-group">
                                        <label>Unidades por Caixa</label>
                                        <input type="number" id="edit-upb-${p.id}" class="form-control" value="${p.units_per_box}" min="1" required>
                                    </div>
                                    <div class="form-group">
                                        <label>Caixas Mínimas</label>
                                        <input type="number" id="edit-minb-${p.id}" class="form-control" value="${p.min_boxes}" min="0" required>
                                    </div>
                                </div>
                                
                                <div class="stock-adjustment-row">
                                    <div>
                                        <label style="display:block; font-size: 0.85rem; font-weight:600; color:var(--text-muted); margin-bottom:5px;">Caixas Fechadas 📦</label>
                                        <div class="stock-control-group">
                                            <button type="button" class="icon-btn minus" style="background:transparent" onclick="updateStock('${p.id}', 'boxes', -1)"><i class="fas fa-minus"></i></button>
                                            <span class="stock-val" id="val-boxes-${p.id}">${p.boxes}</span>
                                            <button type="button" class="icon-btn plus" style="background:transparent" onclick="updateStock('${p.id}', 'boxes', 1)"><i class="fas fa-plus"></i></button>
                                        </div>
                                    </div>
                                    <div>
                                        <label style="display:block; font-size: 0.85rem; font-weight:600; color:var(--text-muted); margin-bottom:5px;">Caixas Abertas 🗃️</label>
                                        <div class="stock-control-group">
                                            <button type="button" class="icon-btn minus" style="background:transparent" onclick="updateStock('${p.id}', 'units', -1)"><i class="fas fa-minus"></i></button>
                                            <span class="stock-val" id="val-units-${p.id}">${p.units}</span>
                                            <button type="button" class="icon-btn plus" style="background:transparent" onclick="updateStock('${p.id}', 'units', 1)"><i class="fas fa-plus"></i></button>
                                        </div>
                                    </div>
                                </div>

                                <div class="modal-footer">
                                    <button type="button" class="btn btn-secondary" onclick="toggleRowAccordion('${p.id}')">Fechar</button>
                                    <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Salvar</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </li>
            `;
        }).join('');

        card.innerHTML = `
            <div class="category-header">
                <div class="category-title"><i class="fas fa-tag"></i> ${category}</div>
                <div class="category-count">${items.length} itens</div>
            </div>
            <ul class="item-list">${itemsHtml}</ul>
        `;
        container.appendChild(card);
    });
}

function renderIfood() {
    const container = document.getElementById('ifoodContainer');
    container.innerHTML = '';

    let filtered = products.filter(p => {
        return p.name.toLowerCase().includes(searchTermIfood) || p.cat.toLowerCase().includes(searchTermIfood);
    });

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-motorcycle"></i>
                <h3>Nenhum produto encontrado</h3>
                <p>Verifique sua pesquisa.</p>
            </div>
        `;
        return;
    }

    // Group by category
    const grouped = filtered.reduce((acc, p) => {
        if (!acc[p.cat]) acc[p.cat] = [];
        acc[p.cat].push(p);
        return acc;
    }, {});

    Object.keys(grouped).sort().forEach(category => {
        const items = grouped[category].sort((a, b) => a.name.localeCompare(b.name));

        const card = document.createElement('div');
        card.className = 'category-card';
        card.style.opacity = 1;

        let itemsHtml = items.map(p => {
            const isChecked = p.ifood_status ? 'checked' : '';
            const rowClass = p.ifood_status ? 'ifood-item-row' : 'ifood-item-row paused';
            const statusLabel = p.ifood_status ? 'Disponível' : 'Não disponível';

            return `
                <li class="${rowClass}">
                    <div class="item-info">
                        <span class="item-name">${p.name}</span>
                    </div>
                    <div class="actions">
                        <label class="toggle-switch">
                            <input type="checkbox" ${isChecked} onchange="toggleIfood('${p.id}', this.checked)">
                            <span class="slider"></span>
                        </label>
                        <span class="toggle-label" style="width: 100px; text-align: right;">${statusLabel}</span>
                    </div>
                </li>
            `;
        }).join('');

        card.innerHTML = `
            <div class="category-header">
                <div class="category-title"><i class="fas fa-tag"></i> ${category}</div>
                <div class="category-count">${items.length} itens</div>
            </div>
            <ul class="item-list">${itemsHtml}</ul>
        `;
        container.appendChild(card);
    });
}

function updateStats() {
    // Estoque Stats
    const total = products.length;
    const lowStock = products.filter(p => (parseInt(p.boxes) || 0) <= (parseInt(p.min_boxes) || 0)).length;
    const okStock = total - lowStock;

    // iFood Stats
    const ifoodActive = products.filter(p => p.ifood_status).length;
    const ifoodPaused = total - ifoodActive;

    document.getElementById('stat-total-val').innerText = total;
    document.getElementById('stat-missing-val').innerText = lowStock;
    document.getElementById('stat-ok-val').innerText = okStock;

    document.getElementById('ifood-active-count').innerText = ifoodActive;
    document.getElementById('ifood-paused-count').innerText = ifoodPaused;

    // Update active classes for Estoque filters
    document.querySelectorAll('.stat-card').forEach(el => el.classList.remove('active'));
    if (currentFilter === 'all') document.getElementById('stat-total').classList.add('active');
    if (currentFilter === 'low') document.getElementById('stat-missing').classList.add('active');
    if (currentFilter === 'ok') document.getElementById('stat-ok').classList.add('active');
}

// Actions
window.filterItems = (filter) => {
    currentFilter = filter;
    render();
    updateStats();
};

window.updateStock = async (id, field, delta) => {
    const p = products.find(x => x.id === id);
    if (!p) return;

    // Prevent negative stock
    const currentVal = parseInt(p[field]) || 0;
    if (currentVal + delta < 0) return;

    const newVal = currentVal + delta;
    p[field] = newVal;

    // Update the specific span in the DOM immediately for speedy UI
    const valElement = document.getElementById(`val-${field}-${id}`);
    if (valElement) valElement.innerText = p[field];

    // Optimistically update the badge in the row header without re-rendering everything
    const accordionContainer = document.getElementById(`accordion-${id}`);
    if (accordionContainer) {
        const rowHeader = accordionContainer.previousElementSibling;
        if (rowHeader && rowHeader.classList.contains('item-row-header')) {
            const badges = rowHeader.querySelectorAll('.qty-badge');
            if (field === 'boxes' && badges.length >= 1) {
                badges[0].innerHTML = `<i class="fas fa-box"></i> ${p.boxes}`;
            } else if (field === 'units' && badges.length >= 2) {
                badges[1].innerHTML = `<i class="fas fa-box-open"></i> ${p.units}`;
            }

            // Update status badge
            const statusBadge = rowHeader.querySelector('.status-badge');
            if (statusBadge) {
                const status = getProductStatus(p);
                statusBadge.className = `status-badge ${status.class}`;
                statusBadge.innerText = status.label;
            }
        }
    }

    updateStats(); // This only updates the top counter cards

    try {
        const payload = {};
        payload[field] = p[field];
        await db.updateProduct(id, payload);
    } catch (e) {
        showToast('Erro', 'Falha ao sincronizar com o banco.', 'error');
        await loadData(); // revert
    }
};

window.deleteProduct = async (id) => {
    if (!confirm('Tem certeza que deseja excluir este produto?')) return;
    try {
        await db.deleteProduct(id);
        products = products.filter(p => p.id !== id);
        render();
        updateStats();
        showToast('Sucesso', 'Produto excluído.', 'success');
    } catch (e) {
        showToast('Erro', 'Falha ao excluir.', 'error');
    }
};

window.toggleIfood = async (id, isActive) => {
    const p = products.find(x => x.id === id);
    if (!p) return;

    p.ifood_status = isActive;
    // Optimistic UI update
    render();
    updateStats();

    try {
        await db.updateProduct(id, { ifood_status: isActive });
        showToast(isActive ? 'Disponível' : 'Indisponível', `"${p.name}" atualizado.`, isActive ? 'success' : 'warning');
    } catch (e) {
        showToast('Erro', 'Falha ao atualizar status do iFood.', 'error');
        await loadData(); // Revert on failure
    }
};

// Search Handlers
document.getElementById('searchInput').addEventListener('input', (e) => {
    searchTerm = e.target.value.toLowerCase().trim();
    render();
});

document.getElementById('searchInputIfood').addEventListener('input', (e) => {
    searchTermIfood = e.target.value.toLowerCase().trim();
    render();
});

// Accordion Logic
window.toggleNewProductAccordion = () => {
    const accordion = document.getElementById('newProductAccordion');
    if (accordion.style.maxHeight === '0px' || accordion.style.maxHeight === '') {
        populateCategories('newCatSelect');
        document.getElementById('newProductForm').reset();
        accordion.style.maxHeight = '500px';
    } else {
        accordion.style.maxHeight = '0px';
    }
};

window.toggleRowAccordion = (id) => {
    const accordion = document.getElementById(`accordion-${id}`);
    if (accordion.style.maxHeight === '0px' || accordion.style.maxHeight === '') {
        accordion.style.maxHeight = '400px';
    } else {
        accordion.style.maxHeight = '0px';
    }
};

window.checkNewCat = (prefix) => {
    const sel = document.getElementById(`${prefix}CatSelect`);
    const input = document.getElementById(`${prefix}CatInput`);
    if (sel.value === 'Nova Categoria...') {
        input.style.display = 'block';
        input.required = true;
    } else {
        input.style.display = 'none';
        input.required = false;
        input.value = '';
    }
};

function populateCategories(selectId) {
    const categories = [...new Set(products.map(p => p.cat))].sort();
    const select = document.getElementById(selectId);
    if (!select) return;

    select.innerHTML = '<option value="" disabled selected>Selecione...</option>';
    categories.forEach(c => {
        select.innerHTML += `<option value="${c}">${c}</option>`;
    });
    select.innerHTML += '<option value="Nova Categoria...">+ Adicionar Nova Categoria</option>';
}

window.saveNewProduct = async () => {
    const sel = document.getElementById('newCatSelect').value;
    const inputCat = document.getElementById('newCatInput').value;
    const cat = sel === 'Nova Categoria...' ? inputCat.trim() : sel;

    const name = document.getElementById('newNameInput').value.trim();
    const boxes = parseInt(document.getElementById('newBoxes').value) || 0;
    const units = parseInt(document.getElementById('newUnits').value) || 0;
    const units_per_box = parseInt(document.getElementById('newUnitsPerBox').value) || 1;
    const min_boxes = parseInt(document.getElementById('newMinBoxes').value) || 0;

    if (!cat || !name) {
        showToast('Aviso', 'Preencha categoria e nome.', 'warning');
        return;
    }

    const payload = {
        cat, name,
        boxes, units, units_per_box, min_boxes
    };

    try {
        const added = await db.addProduct(payload);
        products.push({ ...added, ifood_status: true });
        showToast('Sucesso', 'Produto adicionado.', 'success');
        toggleNewProductAccordion();
        render();
        updateStats();
    } catch (e) {
        showToast('Erro', 'Falha ao salvar produto.', 'error');
    }
};

window.saveProduct = async (id) => {
    const name = document.getElementById(`edit-name-${id}`).value.trim();
    const p = products.find(x => x.id === id);
    const cat = p.cat; // Simplified: keeping category intact on inline edit

    const units_per_box = parseInt(document.getElementById(`edit-upb-${id}`).value) || 1;
    const min_boxes = parseInt(document.getElementById(`edit-minb-${id}`).value) || 0;

    if (!name) {
        showToast('Aviso', 'O nome não pode ser vazio.', 'warning');
        return;
    }

    // Keep current boxes and units (they are updated directly via stock buttons)
    const payload = {
        cat, name,
        units_per_box, min_boxes
    };

    try {
        await db.updateProduct(id, payload);
        Object.assign(p, payload);

        showToast('Sucesso', 'Produto atualizado.', 'success');
        render();
        updateStats();
    } catch (e) {
        showToast('Erro', 'Falha ao salvar produto.', 'error');
    }
};

// Toast
function showToast(title, msg, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-times-circle' : 'fa-info-circle';

    toast.innerHTML = `
        <i class="fas ${icon} toast-icon"></i>
        <div class="toast-content">
            <h4>${title}</h4>
            <p>${msg}</p>
        </div>
    `;

    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Generate PDF
window.generatePDF = () => {
    if (!window.jspdf) {
        showToast('Atenção', 'Biblioteca PDF não carregada', 'warning');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const isDark = document.body.classList.contains('dark-mode');

    doc.setFillColor(14, 165, 233); // Brand primary
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255);
    doc.setFontSize(22);
    doc.text("RELATÓRIO DE ESTOQUE", 105, 25, { align: 'center' });

    doc.setTextColor(50);
    doc.setFontSize(10);
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, 50);

    const tableData = products.sort((a, b) => a.cat.localeCompare(b.cat)).map((p, i) => {
        let status = getProductStatus(p).label;
        const boxesStr = `${p.boxes || 0} cx (fechadas)`;
        const unitsStr = `${p.units || 0} cx (abertas)`;
        return [i + 1, p.cat, p.name, boxesStr, unitsStr, status];
    });

    doc.autoTable({
        startY: 60,
        head: [['#', 'Categoria', 'Produto', 'Cx Fechadas', 'Cx Abertas', 'Status']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [14, 165, 233] },
        didParseCell: function (data) {
            if (data.column.index === 5 && data.section === 'body') {
                if (data.cell.raw === 'ESGOTADO' || data.cell.raw === 'BAIXO') {
                    data.cell.styles.textColor = [239, 68, 68];
                    data.cell.styles.fontStyle = 'bold';
                } else {
                    data.cell.styles.textColor = [16, 185, 129];
                }
            }
        }
    });

    doc.save(`estoque_${new Date().getTime()}.pdf`);
    showToast('Sucesso', 'PDF gerado com sucesso.', 'success');
};

function setupEventListeners() {
    // Other events if needed
}
