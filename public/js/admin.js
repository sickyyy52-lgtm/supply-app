const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user'));
const PRODUCT_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const PRODUCT_IMAGE_MAX_SIZE = 2 * 1024 * 1024;

if (!token || !user || user.role !== 'admin') {
    window.location.href = '/login';
}

async function parseResponse(res) {
    const contentType = res.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
        return await res.json();
    }

    const text = await res.text();
    throw new Error(
        text.startsWith('<') ?
        'Server returned HTML instead of JSON. Check API route or server error.' :
        text
    );
}

const productForm = document.getElementById('product-form');
const productImageInput = document.getElementById('image');
const productImagePreview = document.getElementById('product-image-preview');
const productImageHelp = document.getElementById('product-image-help');
const adminProducts = document.getElementById('admin-products');
const adminOrders = document.getElementById('admin-orders');
const adminUsers = document.getElementById('admin-users');
const adminLogoutBtn = document.getElementById('admin-logout-btn');

const adminProductSearch = document.getElementById('admin-product-search');
const adminUserSearch = document.getElementById('admin-user-search');
const orderStatusFilter = document.getElementById('order-status-filter');
const orderSearchInput = document.getElementById('order-search-input');
const stockFilter = document.getElementById('stock-filter');

const statUsers = document.getElementById('stat-users');
const statProducts = document.getElementById('stat-products');
const statOrders = document.getElementById('stat-orders');
const statRevenue = document.getElementById('stat-revenue');

const pendingOrdersCount = document.getElementById('pending-orders-count');
const approvedOrdersCount = document.getElementById('approved-orders-count');
const deliveredOrdersCount = document.getElementById('delivered-orders-count');
const categoryCount = document.getElementById('category-count');

const lowStockList = document.getElementById('low-stock-list');
const topCustomersList = document.getElementById('top-customers-list');

const exportProductsBtn = document.getElementById('export-products-btn');
const exportOrdersBtn = document.getElementById('export-orders-btn');
const exportUsersBtn = document.getElementById('export-users-btn');
const paymentConfigForm = document.getElementById('payment-config-form');
const adminUpiIdInput = document.getElementById('admin-upi-id');
const adminUpiQrFileInput = document.getElementById('admin-upi-qr-file');
const adminCurrentQrWrap = document.getElementById('admin-current-qr-wrap');
const pendingOrderProofsContainer = document.getElementById('pending-order-proofs');
const pendingWalletTopupsContainer = document.getElementById('pending-wallet-topups');
const passwordResetRequestsContainer = document.getElementById('password-reset-requests');
const refreshPasswordResetsBtn = document.getElementById('refresh-password-resets-btn');

let allProducts = [];
let allOrders = [];
let allUsers = [];
let allPasswordResetRequests = [];
let currentProductImageUrl = '';
let latestApprovedResetPassword = null;

async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function formatDateTime(value) {
    if (!value) return '-';
    return new Date(value).toLocaleString();
}

function formatPaymentMethod(method) {
    if (method === 'COD' || method === 'Cash on Delivery') return 'COD';
    return method || '-';
}

function formatPaymentStatus(status) {
    return String(status || '-').replace(/_/g, ' ');
}

if (adminLogoutBtn) {
    adminLogoutBtn.addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
    });
}

document.querySelectorAll('.admin-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        const tab = document.getElementById(btn.dataset.tab);
        if (tab) tab.classList.add('active');
    });
});

function updateStats() {
    if (statUsers) statUsers.textContent = allUsers.length;
    if (statProducts) statProducts.textContent = allProducts.length;
    if (statOrders) statOrders.textContent = allOrders.length;

    const revenue = allOrders.reduce((sum, order) => sum + Number(order.total_price || 0), 0);
    if (statRevenue) statRevenue.textContent = revenue.toFixed(2);

    if (pendingOrdersCount) pendingOrdersCount.textContent = allOrders.filter(o => o.status === 'Pending').length;
    if (approvedOrdersCount) approvedOrdersCount.textContent = allOrders.filter(o => o.status === 'Approved').length;
    if (deliveredOrdersCount) deliveredOrdersCount.textContent = allOrders.filter(o => o.status === 'Delivered').length;
    if (categoryCount) categoryCount.textContent = new Set(allProducts.map(p => p.category)).size;
}

function renderOverviewWidgets() {
    renderLowStock();
    renderTopCustomers();
}

function renderLowStock() {
    if (!lowStockList) return;

    lowStockList.innerHTML = '';
    const lowStockProducts = allProducts.filter(p => Number(p.stock || 0) <= 10);

    if (!lowStockProducts.length) {
        lowStockList.innerHTML = `<div class="admin-empty-state">No low stock products.</div>`;
        return;
    }

    lowStockProducts.forEach(product => {
        const item = document.createElement('div');
        item.className = 'admin-mini-item';
        item.innerHTML = `
            <h4>${product.name}</h4>
            <p>Category: ${product.category}</p>
            <p>Stock Left: ${product.stock}</p>
        `;
        lowStockList.appendChild(item);
    });
}

function renderTopCustomers() {
    if (!topCustomersList) return;

    topCustomersList.innerHTML = '';

    if (!allOrders.length) {
        topCustomersList.innerHTML = `<div class="admin-empty-state">No customer order data available.</div>`;
        return;
    }

    const customerSpendMap = {};

    allOrders.forEach(order => {
        const key = order.customer_name || 'Unknown';
        if (!customerSpendMap[key]) {
            customerSpendMap[key] = { name: key, total: 0, orders: 0 };
        }

        customerSpendMap[key].total += Number(order.total_price || 0);
        customerSpendMap[key].orders += 1;
    });

    const topCustomers = Object.values(customerSpendMap)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

    topCustomers.forEach(customer => {
        const item = document.createElement('div');
        item.className = 'admin-mini-item';
        item.innerHTML = `
            <h4>${customer.name}</h4>
            <p>Total Orders: ${customer.orders}</p>
            <p>Total Spend: ₹${customer.total.toFixed(2)}</p>
        `;
        topCustomersList.appendChild(item);
    });
}

function renderProducts(products) {
    if (!adminProducts) return;

    adminProducts.innerHTML = '';

    if (!products.length) {
        adminProducts.innerHTML = `<div class="admin-empty-state">No products found.</div>`;
        return;
    }

    products.forEach(product => {
        const lowStockClass = Number(product.stock) <= 10 ? 'low-stock-badge' : 'stock-badge';
        const item = document.createElement('div');
        item.className = 'admin-product-item';

        item.innerHTML = `
            <div class="admin-product-thumb">
                <img src="${product.image}" alt="${product.name}" />
            </div>

            <div class="admin-product-info">
                <h3>${product.name}</h3>
                <p>${product.category}</p>
                <p class="admin-product-price">₹${Number(product.price).toFixed(2)}</p>
                <p class="${lowStockClass}">Stock: ${product.stock ?? 0}</p>
                <p>${product.image}</p>
            </div>

            <div class="admin-product-actions">
                <button class="admin-btn edit-btn">Edit</button>
                <button class="admin-btn delete-btn">Delete</button>
            </div>
        `;

        item.querySelector('.edit-btn').addEventListener('click', () => editProduct(product));
        item.querySelector('.delete-btn').addEventListener('click', () => deleteProduct(product.id));

        adminProducts.appendChild(item);
    });

    if (window.NextsUI) {
        window.NextsUI.applyImageFallbacks();
    }
}

/* UPDATED: includes Delivery Slot + View Invoice */
function renderOrders(orders) {
    if (!adminOrders) return;

    adminOrders.innerHTML = '';

    if (!orders.length) {
        adminOrders.innerHTML = `<div class="admin-empty-state">No orders available.</div>`;
        return;
    }

    orders.forEach(order => {
        const itemsHtml = (order.items || []).map(item => `
            <li>${item.name} — Qty: ${item.quantity} — ₹${Number(item.price).toFixed(2)}</li>
        `).join('');

        const card = document.createElement('div');
        card.className = 'admin-order-card';

        card.innerHTML = `
            <div class="admin-order-top">
                <h3>Order #${order.id}</h3>
                <span>${order.status || 'Pending'}</span>
            </div>

            <div class="admin-order-meta">
                <p><strong>Name:</strong> ${order.customer_name || '-'}</p>
                <p><strong>Phone:</strong> ${order.phone || '-'}</p>
                <p><strong>Address:</strong> ${order.address || '-'}</p>
                <p><strong>Total:</strong> ₹${Number(order.total_price || 0).toFixed(2)}</p>
                <p><strong>Delivery Slot:</strong> ${
                  order.delivery_slot === 'morning' ? 'Morning (6–9 AM)' :
                  order.delivery_slot === 'afternoon' ? 'Afternoon (12–3 PM)' :
                  order.delivery_slot === 'evening' ? 'Evening (5–8 PM)' :
                  'Any'
                }</p>
                <p><strong>Payment:</strong> ${formatPaymentMethod(order.payment_method)}</p>
                <p><strong>Payment Status:</strong> ${formatPaymentStatus(order.payment_status)}</p>
                <p><strong>Subscription:</strong> ${order.is_subscription ? 'Yes' : 'No'}</p>
                <p><strong>Date:</strong> ${order.created_at ? new Date(order.created_at).toLocaleString() : '-'}</p>
            </div>

            <div class="admin-order-items">
                <h4>Items</h4>
                <ul>${itemsHtml || '<li>No items found</li>'}</ul>
            </div>

            <div class="admin-order-quick-actions">
                <button class="admin-btn quick-status-btn" onclick="updateOrderStatus(${order.id}, 'Approved')">Approve</button>
                <button class="admin-btn quick-status-btn" onclick="updateOrderStatus(${order.id}, 'Processing')">Processing</button>
                <button class="admin-btn quick-status-btn" onclick="updateOrderStatus(${order.id}, 'Packed')">Packed</button>
                <button class="admin-btn quick-status-btn" onclick="updateOrderStatus(${order.id}, 'Shipped')">Shipped</button>
                <button class="admin-btn quick-status-btn" onclick="updateOrderStatus(${order.id}, 'Delivered')">Delivered</button>
                <button class="admin-btn delete-btn" onclick="updateOrderStatus(${order.id}, 'Rejected')">Reject</button>
                <button class="admin-btn quick-status-btn"
                        onclick="window.location.href='/invoice.html?orderId=${order.id}'">
                    View Invoice
                </button>
            </div>

            <div style="margin-top:16px;">
                <select class="admin-search-input order-status-select" data-id="${order.id}">
                    <option value="Pending" ${order.status === 'Pending' ? 'selected' : ''}>Pending</option>
                    <option value="Processing" ${order.status === 'Processing' ? 'selected' : ''}>Processing</option>
                    <option value="Approved" ${order.status === 'Approved' ? 'selected' : ''}>Approved</option>
                    <option value="Packed" ${order.status === 'Packed' ? 'selected' : ''}>Packed</option>
                    <option value="Shipped" ${order.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
                    <option value="Delivered" ${order.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
                    <option value="Cancelled" ${order.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                    <option value="Rejected" ${order.status === 'Rejected' ? 'selected' : ''}>Rejected</option>
                </select>
            </div>
        `;

        adminOrders.appendChild(card);
    });

    document.querySelectorAll('.order-status-select').forEach(select => {
        select.addEventListener('change', () => {
            updateOrderStatus(select.dataset.id, select.value);
        });
    });
}

function renderProductImagePreview(imageUrl, fileName = '') {
    if (!productImagePreview) return;

    if (!imageUrl) {
        productImagePreview.innerHTML = '';
        if (productImageHelp) {
            productImageHelp.textContent = 'Select an image file to upload.';
        }
        return;
    }

    productImagePreview.innerHTML = `
        <p style="margin-bottom:6px;">${fileName ? `Selected: ${fileName}` : 'Current image:'}</p>
        <img src="${imageUrl}" alt="Product preview" style="width:120px; height:120px; object-fit:cover; border-radius:10px; border:1px solid #e5e5e5;" />
    `;

    if (productImageHelp) {
        productImageHelp.textContent = fileName
            ? 'Image will upload when you save the product.'
            : 'Leave empty to keep the current image when editing.';
    }
}

if (productImageInput) {
    productImageInput.addEventListener('change', () => {
        const file = productImageInput.files && productImageInput.files[0];

        if (!file) {
            renderProductImagePreview(currentProductImageUrl);
            return;
        }

        if (!PRODUCT_IMAGE_TYPES.has(file.type)) {
            productImageInput.value = '';
            renderProductImagePreview(currentProductImageUrl);
            if (window.NextsUI) window.NextsUI.showToast('Only JPEG, PNG, and WEBP product images are allowed', 'error');
            return;
        }

        if (file.size > PRODUCT_IMAGE_MAX_SIZE) {
            productImageInput.value = '';
            renderProductImagePreview(currentProductImageUrl);
            if (window.NextsUI) window.NextsUI.showToast('Product image must be 2MB or smaller', 'error');
            return;
        }

        renderProductImagePreview(URL.createObjectURL(file), file.name);
    });
}

function renderUsers(users) {
    if (!adminUsers) return;

    adminUsers.innerHTML = '';

    if (!users.length) {
        adminUsers.innerHTML = `<div class="admin-empty-state">No users found.</div>`;
        return;
    }

    users.forEach(u => {
        const blockBadge = u.is_blocked ?
            '<span class="blocked-user-badge">Blocked</span>' :
            '<span class="active-user-badge">Active</span>';

        const card = document.createElement('div');
        card.className = 'admin-order-card';

        card.innerHTML = `
            <div class="admin-order-top">
                <h3>${u.name || '-'}</h3>
                <span>${u.role || 'user'}</span>
            </div>

            <div style="margin-bottom:12px;">${blockBadge}</div>

            <div class="admin-order-meta">
                <p><strong>Email:</strong> ${u.email || '-'}</p>
                <p><strong>Phone:</strong> ${u.phone || '-'}</p>
                <p><strong>Address:</strong> ${u.address || '-'}</p>
            </div>

            <div class="admin-order-quick-actions">
                <button class="admin-btn quick-status-btn" onclick="toggleBlockUser(${u.id}, ${u.is_blocked ? 0 : 1})">
                    ${u.is_blocked ? 'Unblock User' : 'Block User'}
                </button>
                <button class="admin-btn delete-btn" onclick="deleteUser(${u.id})">Delete User</button>
            </div>

            <div style="margin-top:16px;">
                <select class="admin-search-input user-role-select" data-id="${u.id}">
                    <option value="user" ${u.role === 'user' ? 'selected' : ''}>User</option>
                    <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
            </div>
        `;

        adminUsers.appendChild(card);
    });

    document.querySelectorAll('.user-role-select').forEach(select => {
        select.addEventListener('change', () => {
            updateUserRole(select.dataset.id, select.value);
        });
    });
}

function renderPasswordResetRequests(requests) {
    if (!passwordResetRequestsContainer) return;

    passwordResetRequestsContainer.innerHTML = '';

    if (!requests.length) {
        passwordResetRequestsContainer.innerHTML = '<div class="admin-empty-state">No password reset requests.</div>';
        return;
    }

    requests.forEach(request => {
        const user = request.userId || {};
        const requestId = request._id;
        const status = request.status || 'pending';
        const latestPasswordHtml = latestApprovedResetPassword && latestApprovedResetPassword.id === requestId ?
            `
                <div class="password-reset-result">
                    <strong>New password:</strong>
                    <code>${escapeHtml(latestApprovedResetPassword.password)}</code>
                    <small>Share this manually with the user. It is not stored.</small>
                </div>
            ` :
            '';

        const actionHtml = status === 'pending' ?
            `
                <div class="admin-order-quick-actions">
                    <button class="admin-btn quick-status-btn reset-approve-btn" data-id="${requestId}">Approve</button>
                    <button class="admin-btn delete-btn reset-reject-btn" data-id="${requestId}">Reject</button>
                </div>
            ` :
            '';

        const card = document.createElement('div');
        card.className = 'admin-order-card password-reset-card';
        card.innerHTML = `
            <div class="admin-order-top">
                <h3>${escapeHtml(user.name || 'User')}</h3>
                <span class="reset-status-badge status-${escapeHtml(status)}">${escapeHtml(status)}</span>
            </div>

            <div class="admin-order-meta">
                <p><strong>Email:</strong> ${escapeHtml(request.email || user.email || '-')}</p>
                <p><strong>Phone:</strong> ${escapeHtml(request.phone || user.phone || '-')}</p>
                <p><strong>Note:</strong> ${escapeHtml(request.note || '-')}</p>
                <p><strong>Admin Note:</strong> ${escapeHtml(request.adminNote || '-')}</p>
                <p><strong>Created:</strong> ${escapeHtml(formatDateTime(request.createdAt))}</p>
            </div>

            ${latestPasswordHtml}
            ${actionHtml}
        `;

        passwordResetRequestsContainer.appendChild(card);
    });

    passwordResetRequestsContainer.querySelectorAll('.reset-approve-btn').forEach(btn => {
        btn.addEventListener('click', () => approvePasswordResetRequest(btn.dataset.id));
    });

    passwordResetRequestsContainer.querySelectorAll('.reset-reject-btn').forEach(btn => {
        btn.addEventListener('click', () => rejectPasswordResetRequest(btn.dataset.id));
    });
}

async function fetchPasswordResetRequests() {
    if (!passwordResetRequestsContainer) return;

    try {
        const res = await fetch('/api/admin/password-reset-requests', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await parseResponse(res);
        if (!res.ok) throw new Error(data.message || 'Failed to fetch password reset requests');

        allPasswordResetRequests = Array.isArray(data) ? data : [];
        renderPasswordResetRequests(allPasswordResetRequests);
    } catch (error) {
        passwordResetRequestsContainer.innerHTML = `<div class="admin-empty-state">${escapeHtml(error.message || 'Failed to load password reset requests')}</div>`;
    }
}

async function approvePasswordResetRequest(requestId) {
    const customPassword = prompt('Enter a custom password with at least 8 characters, or leave blank to auto-generate:') || '';
    const note = prompt('Optional admin note for this approval:') || '';
    const payload = {};

    if (customPassword.trim()) {
        if (customPassword.trim().length < 8) {
            if (window.NextsUI) window.NextsUI.showToast('Custom password must be at least 8 characters', 'error');
            return;
        }
        payload.password = customPassword.trim();
    }

    if (note.trim()) payload.note = note.trim();

    try {
        const res = await fetch(`/api/admin/password-reset-requests/${requestId}/approve`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        const data = await parseResponse(res);
        if (!res.ok) throw new Error(data.message || 'Failed to approve password reset');

        latestApprovedResetPassword = {
            id: requestId,
            password: data.password
        };

        if (window.NextsUI) window.NextsUI.showToast('Password reset approved', 'success');
        fetchPasswordResetRequests();
    } catch (error) {
        if (window.NextsUI) window.NextsUI.showToast(error.message || 'Failed to approve password reset', 'error');
    }
}

async function rejectPasswordResetRequest(requestId) {
    const note = prompt('Optional rejection note:') || '';

    try {
        const res = await fetch(`/api/admin/password-reset-requests/${requestId}/reject`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ note: note.trim() })
        });
        const data = await parseResponse(res);
        if (!res.ok) throw new Error(data.message || 'Failed to reject password reset');

        if (latestApprovedResetPassword && latestApprovedResetPassword.id === requestId) {
            latestApprovedResetPassword = null;
        }

        if (window.NextsUI) window.NextsUI.showToast('Password reset rejected', 'success');
        fetchPasswordResetRequests();
    } catch (error) {
        if (window.NextsUI) window.NextsUI.showToast(error.message || 'Failed to reject password reset', 'error');
    }
}

if (refreshPasswordResetsBtn) {
    refreshPasswordResetsBtn.addEventListener('click', fetchPasswordResetRequests);
}

async function fetchProducts() {
    try {
        const res = await fetch('/api/products');
        const data = await parseResponse(res);

        if (!res.ok) throw new Error(data.message || 'Failed to load products');

        allProducts = Array.isArray(data) ? data : [];
        renderProducts(allProducts);
        updateStats();
        renderOverviewWidgets();
    } catch (error) {
        console.error('Fetch products error:', error);
        if (adminProducts) {
            adminProducts.innerHTML = `<div class="admin-empty-state">${error.message || 'Failed to load products.'}</div>`;
        }
        if (window.NextsUI) window.NextsUI.showToast(error.message || 'Failed to load products', 'error');
    }
}

async function fetchOrders() {
    try {
        const res = await fetch('/api/orders', {
            headers: { Authorization: `Bearer ${token}` }
        });

        const data = await parseResponse(res);

        if (!res.ok) throw new Error(data.message || 'Failed to load orders');

        allOrders = Array.isArray(data) ? data : [];
        renderOrders(allOrders);
        updateStats();
        renderOverviewWidgets();
    } catch (error) {
        console.error('Fetch orders error:', error);
        if (adminOrders) {
            adminOrders.innerHTML = `<div class="admin-empty-state">${error.message || 'Failed to load orders.'}</div>`;
        }
        if (window.NextsUI) window.NextsUI.showToast(error.message || 'Failed to load orders', 'error');
    }
}

async function fetchUsers() {
    try {
        const res = await fetch('/api/auth/users', {
            headers: { Authorization: `Bearer ${token}` }
        });

        const data = await parseResponse(res);

        if (!res.ok) throw new Error(data.message || 'Failed to load users');

        allUsers = Array.isArray(data) ? data : [];
        renderUsers(allUsers);
        updateStats();
    } catch (error) {
        console.error('Fetch users error:', error);
        if (adminUsers) {
            adminUsers.innerHTML = `<div class="admin-empty-state">${error.message || 'Failed to load users.'}</div>`;
        }
        if (window.NextsUI) window.NextsUI.showToast(error.message || 'Failed to load users', 'error');
    }
}

if (productForm) {
    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const id = document.getElementById('product-id').value;
        const name = document.getElementById('name').value.trim();
        const category = document.getElementById('category').value.trim();
        const price = document.getElementById('price').value.trim();
        const stock = document.getElementById('stock').value.trim();
        const selectedFile = productImageInput && productImageInput.files ? productImageInput.files[0] : null;

        const method = id ? 'PUT' : 'POST';
        const url = id ? `/api/products/${id}` : '/api/products';

        if (!id && !selectedFile) {
            if (window.NextsUI) window.NextsUI.showToast('Product image is required', 'error');
            return;
        }

        if (selectedFile && !PRODUCT_IMAGE_TYPES.has(selectedFile.type)) {
            if (window.NextsUI) window.NextsUI.showToast('Only JPEG, PNG, and WEBP product images are allowed', 'error');
            return;
        }

        if (selectedFile && selectedFile.size > PRODUCT_IMAGE_MAX_SIZE) {
            if (window.NextsUI) window.NextsUI.showToast('Product image must be 2MB or smaller', 'error');
            return;
        }

        const formData = new FormData(productForm);

        formData.set('name', name);
        formData.set('category', category);
        formData.set('price', price);
        formData.set('stock', stock);

        if (!selectedFile) {
            formData.delete('image');
        }

        if (id && currentProductImageUrl) {
            formData.append('existingImage', currentProductImageUrl);
        }

        try {
            const res = await fetch(url, {
                method,
                headers: {
                    Authorization: `Bearer ${token}`
                },
                body: formData
            });

            const data = await parseResponse(res);

            if (!res.ok) throw new Error(data.message || 'Failed to save product');

            productForm.reset();
            document.getElementById('product-id').value = '';
            currentProductImageUrl = '';
            renderProductImagePreview('');
            await fetchProducts();

            if (window.NextsUI) {
                window.NextsUI.showToast(data.message || 'Product saved successfully', 'success');
            }
        } catch (error) {
            console.error('Save product error:', error);
            if (window.NextsUI) window.NextsUI.showToast(error.message || 'Server error while saving product', 'error');
        }
    });
}

function editProduct(product) {
    document.getElementById('product-id').value = product.id;
    document.getElementById('name').value = product.name;
    document.getElementById('category').value = product.category;
    document.getElementById('price').value = product.price;
    document.getElementById('stock').value = product.stock || 0;
    currentProductImageUrl = product.image || '';

    if (productImageInput) {
        productImageInput.value = '';
    }

    renderProductImagePreview(currentProductImageUrl);

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteProduct(id) {
    const confirmed = confirm('Delete this product?');
    if (!confirmed) return;

    try {
        const res = await fetch(`/api/products/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        });

        const data = await parseResponse(res);

        if (!res.ok) throw new Error(data.message || 'Failed to delete product');

        await fetchProducts();

        if (window.NextsUI) window.NextsUI.showToast(data.message || 'Product deleted', 'success');
    } catch (error) {
        console.error('Delete product error:', error);
        if (window.NextsUI) window.NextsUI.showToast(error.message || 'Server error while deleting product', 'error');
    }
}

window.updateOrderStatus = async function (orderId, status) {
    try {
        const res = await fetch(`/api/orders/${orderId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ status })
        });

        const data = await parseResponse(res);

        if (!res.ok) throw new Error(data.message || 'Failed to update order status');

        await fetchOrders();

        if (window.NextsUI) window.NextsUI.showToast(data.message || 'Order status updated', 'success');
    } catch (error) {
        console.error('Update order status error:', error);
        if (window.NextsUI) window.NextsUI.showToast(error.message || 'Server error while updating order', 'error');
    }
};

async function updateUserRole(userId, role) {
    try {
        const res = await fetch(`/api/auth/users/${userId}/role`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ role })
        });

        const data = await parseResponse(res);

        if (!res.ok) throw new Error(data.message || 'Failed to update role');

        await fetchUsers();

        if (window.NextsUI) window.NextsUI.showToast(data.message || 'User role updated', 'success');
    } catch (error) {
        console.error('Update user role error:', error);
        if (window.NextsUI) window.NextsUI.showToast(error.message || 'Server error while updating role', 'error');
    }
}

window.toggleBlockUser = async function (userId, isBlocked) {
    try {
        const res = await fetch(`/api/auth/users/${userId}/block`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ is_blocked: isBlocked })
        });

        const data = await parseResponse(res);

        if (!res.ok) throw new Error(data.message || 'Failed to update block status');

        await fetchUsers();

        if (window.NextsUI) window.NextsUI.showToast(data.message || 'User block status updated', 'success');
    } catch (error) {
        console.error('Toggle block user error:', error);
        if (window.NextsUI) window.NextsUI.showToast(error.message || 'Server error while updating block status', 'error');
    }
};

window.deleteUser = async function (userId) {
    const confirmed = confirm('Delete this user?');
    if (!confirmed) return;

    try {
        const res = await fetch(`/api/auth/users/${userId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        });

        const data = await parseResponse(res);

        if (!res.ok) throw new Error(data.message || 'Failed to delete user');

        await fetchUsers();

        if (window.NextsUI) window.NextsUI.showToast(data.message || 'User deleted', 'success');
    } catch (error) {
        console.error('Delete user error:', error);
        if (window.NextsUI) window.NextsUI.showToast(error.message || 'Server error while deleting user', 'error');
    }
};

function filterProductsView() {
    let filtered = [...allProducts];
    const searchQuery = adminProductSearch ? adminProductSearch.value.trim().toLowerCase() : '';
    const stockValue = stockFilter ? stockFilter.value : '';

    if (searchQuery) {
        filtered = filtered.filter(product =>
            (product.name || '').toLowerCase().includes(searchQuery) ||
            (product.category || '').toLowerCase().includes(searchQuery)
        );
    }

    if (stockValue === 'Low') {
        filtered = filtered.filter(product => Number(product.stock || 0) <= 10);
    } else if (stockValue === 'In') {
        filtered = filtered.filter(product => Number(product.stock || 0) > 10);
    }

    renderProducts(filtered);
}

function filterOrdersView() {
    let filtered = [...allOrders];
    const statusValue = orderStatusFilter ? orderStatusFilter.value : 'All';
    const searchQuery = orderSearchInput ? orderSearchInput.value.trim().toLowerCase() : '';

    if (statusValue !== 'All') {
        filtered = filtered.filter(order => order.status === statusValue);
    }

    if (searchQuery) {
        filtered = filtered.filter(order =>
            (order.customer_name || '').toLowerCase().includes(searchQuery) ||
            (order.phone || '').toLowerCase().includes(searchQuery)
        );
    }

    renderOrders(filtered);
}

if (adminProductSearch) adminProductSearch.addEventListener('input', filterProductsView);
if (stockFilter) stockFilter.addEventListener('change', filterProductsView);

if (adminUserSearch) {
    adminUserSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        renderUsers(
            allUsers.filter(u =>
                (u.name || '').toLowerCase().includes(query) ||
                (u.email || '').toLowerCase().includes(query)
            )
        );
    });
}

if (orderStatusFilter) orderStatusFilter.addEventListener('change', filterOrdersView);
if (orderSearchInput) orderSearchInput.addEventListener('input', filterOrdersView);

function downloadCSV(filename, rows) {
    if (!rows.length) {
        if (window.NextsUI) window.NextsUI.showToast('No data available to export', 'info');
        return;
    }

    const processRow = (row) => {
        return row.map(value => {
            const stringValue = value === null || value === undefined ? '' : String(value);
            return `"${stringValue.replace(/"/g, '""')}"`;
        }).join(',');
    };

    const csvContent = rows.map(processRow).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

if (exportProductsBtn) {
    exportProductsBtn.addEventListener('click', () => {
        const rows = [
            ['ID', 'Name', 'Category', 'Price', 'Stock', 'Image']
        ];
        allProducts.forEach(product => {
            rows.push([product.id, product.name, product.category, product.price, product.stock, product.image]);
        });
        downloadCSV('products.csv', rows);
    });
}

if (exportOrdersBtn) {
    exportOrdersBtn.addEventListener('click', () => {
        const rows = [
            ['Order ID', 'Customer Name', 'Phone', 'Address', 'Total Price', 'Payment Method', 'Status', 'Created At']
        ];
        allOrders.forEach(order => {
            rows.push([
                order.id,
                order.customer_name,
                order.phone,
                order.address,
                order.total_price,
                formatPaymentMethod(order.payment_method),
                order.status || 'Pending',
                order.created_at
            ]);
        });
        downloadCSV('orders.csv', rows);
    });
}

if (exportUsersBtn) {
    exportUsersBtn.addEventListener('click', () => {
        const rows = [
            ['ID', 'Name', 'Email', 'Role', 'Phone', 'Address', 'Blocked']
        ];
        allUsers.forEach(u => {
            rows.push([
                u.id,
                u.name,
                u.email,
                u.role,
                u.phone || '',
                u.address || '',
                u.is_blocked ? 'Yes' : 'No'
            ]);
        });
        downloadCSV('users.csv', rows);
    });
}

async function fetchPaymentConfig() {
    if (!adminUpiIdInput) return;
    try {
        const res = await fetch('/api/payments/config');
        const data = await parseResponse(res);
        if (!res.ok) throw new Error(data.message || 'Failed to fetch payment config');

        const qrUrl = data?.qr_image_url || data?.last_valid_qr_image_url || '';
        adminUpiIdInput.value = data?.upi_id || '';
        if (adminCurrentQrWrap) {
            adminCurrentQrWrap.innerHTML = '';

            if (qrUrl) {
                const label = document.createElement('p');
                label.style.marginBottom = '6px';
                label.textContent = 'Current QR:';

                const img = document.createElement('img');
                img.src = qrUrl;
                img.alt = 'Current QR';
                img.style.width = '160px';
                img.style.maxWidth = '100%';
                img.style.borderRadius = '8px';
                img.onerror = () => {
                    img.style.display = 'none';
                    label.textContent = 'Saved QR could not be loaded. Upload a new QR to replace it.';
                };

                adminCurrentQrWrap.append(label, img);
            } else {
                adminCurrentQrWrap.innerHTML = '<p style="color:#667085;">No QR image configured.</p>';
            }
        }
    } catch (error) {
        if (window.NextsUI) window.NextsUI.showToast(error.message || 'Failed to load payment config', 'error');
    }
}

if (paymentConfigForm) {
    paymentConfigForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const upiId = adminUpiIdInput.value.trim();
            if (!upiId) {
                if (window.NextsUI) window.NextsUI.showToast('UPI ID is required', 'error');
                return;
            }

            const file = adminUpiQrFileInput ? adminUpiQrFileInput.files[0] : null;
            const payload = { upi_id: upiId };
            if (file) {
                if (!PRODUCT_IMAGE_TYPES.has(file.type)) {
                    if (window.NextsUI) window.NextsUI.showToast('Only JPEG, PNG, and WEBP QR images are allowed', 'error');
                    return;
                }

                if (file.size > PRODUCT_IMAGE_MAX_SIZE) {
                    if (window.NextsUI) window.NextsUI.showToast('QR image must be 2MB or smaller', 'error');
                    return;
                }

                payload.qr_image_base64 = await fileToBase64(file);
            }

            const res = await fetch('/api/payments/config', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(payload)
            });

            const data = await parseResponse(res);
            if (!res.ok) throw new Error(data.message || 'Failed to update payment config');

            if (adminUpiQrFileInput) adminUpiQrFileInput.value = '';
            if (window.NextsUI) window.NextsUI.showToast(data.message || 'Payment config updated', 'success');
            fetchPaymentConfig();
        } catch (error) {
            if (window.NextsUI) window.NextsUI.showToast(error.message || 'Failed to update payment config', 'error');
        }
    });
}

function renderPendingOrderProofs(proofs) {
    if (!pendingOrderProofsContainer) return;
    pendingOrderProofsContainer.innerHTML = '';

    if (!proofs.length) {
        pendingOrderProofsContainer.innerHTML = '<div class="admin-empty-state">No pending order payment proofs.</div>';
        return;
    }

    proofs.forEach((proof) => {
        const item = document.createElement('div');
        item.className = 'admin-mini-item';
        item.innerHTML = `
            <h4>Order #${proof.order_id} - ${proof.user_name || '-'}</h4>
            <p>Amount: ₹${Number(proof.amount || 0).toFixed(2)}</p>
            <p>Email: ${proof.user_email || '-'}</p>
            <p>
                <a href="${proof.image_url}" target="_blank" rel="noopener noreferrer">View Screenshot</a>
            </p>
            <div style="display:flex; gap:8px; margin-top:8px;">
                <button class="admin-btn quick-status-btn proof-approve-btn" data-id="${proof.proof_id}">Approve</button>
                <button class="admin-btn delete-btn proof-reject-btn" data-id="${proof.proof_id}">Reject</button>
            </div>
        `;

        const proofDetails = document.createElement('div');
        proofDetails.innerHTML = `
            <p>Payment Method: UPI</p>
            <p>Payment Status: ${formatPaymentStatus(proof.payment_status)}</p>
            <p>UTR / Transaction ID: ${proof.transaction_id || '-'}</p>
            <img src="${proof.image_url}" alt="Payment screenshot for order ${proof.order_id}" style="width:100%; max-width:220px; border-radius:12px; margin-top:8px; border:1px solid #e5e5e5;" />
        `;
        const proofActions = item.querySelector('.proof-approve-btn')?.parentElement;
        item.insertBefore(proofDetails, proofActions || null);
        pendingOrderProofsContainer.appendChild(item);
    });

    pendingOrderProofsContainer.querySelectorAll('.proof-approve-btn').forEach(btn => {
        btn.addEventListener('click', () => reviewOrderProof(btn.dataset.id, 'approved'));
    });

    pendingOrderProofsContainer.querySelectorAll('.proof-reject-btn').forEach(btn => {
        btn.addEventListener('click', () => reviewOrderProof(btn.dataset.id, 'rejected'));
    });
}

async function fetchPendingOrderProofs() {
    if (!pendingOrderProofsContainer) return;
    try {
        const res = await fetch('/api/payments/order-proofs/pending', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await parseResponse(res);
        if (!res.ok) throw new Error(data.message || 'Failed to fetch payment proofs');
        renderPendingOrderProofs(Array.isArray(data) ? data : []);
    } catch (error) {
        pendingOrderProofsContainer.innerHTML = `<div class="admin-empty-state">${error.message || 'Failed to load pending proofs'}</div>`;
    }
}

async function reviewOrderProof(proofId, status) {
    const notes = prompt(`Optional note for ${status}:`) || '';
    try {
        const res = await fetch(`/api/payments/order-proofs/${proofId}/review`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ status, notes })
        });
        const data = await parseResponse(res);
        if (!res.ok) throw new Error(data.message || 'Failed to review payment proof');
        if (window.NextsUI) window.NextsUI.showToast(data.message || 'Payment proof reviewed', 'success');
        fetchPendingOrderProofs();
        fetchOrders();
    } catch (error) {
        if (window.NextsUI) window.NextsUI.showToast(error.message || 'Failed to review payment proof', 'error');
    }
}

function renderPendingWalletTopups(topups) {
    if (!pendingWalletTopupsContainer) return;
    pendingWalletTopupsContainer.innerHTML = '';

    if (!topups.length) {
        pendingWalletTopupsContainer.innerHTML = '<div class="admin-empty-state">No pending wallet top-ups.</div>';
        return;
    }

    topups.forEach((topup) => {
        const item = document.createElement('div');
        item.className = 'admin-mini-item';
        item.innerHTML = `
            <h4>Top-up #${topup.id} - ${topup.user_name || '-'}</h4>
            <p>User ID: ${topup.user_id}</p>
            <p>Email: ${topup.user_email || '-'}</p>
            <p>Requested: ₹${Number(topup.requested_amount || 0).toFixed(2)}</p>
            <p>
                <a href="${topup.image_url || '#'}" target="_blank" rel="noopener noreferrer">View Screenshot</a>
            </p>
            <div style="display:flex; gap:8px; margin-top:8px;">
                <button class="admin-btn quick-status-btn topup-approve-btn" data-id="${topup.id}">Approve</button>
                <button class="admin-btn delete-btn topup-reject-btn" data-id="${topup.id}">Reject</button>
            </div>
        `;
        pendingWalletTopupsContainer.appendChild(item);
    });

    pendingWalletTopupsContainer.querySelectorAll('.topup-approve-btn').forEach(btn => {
        btn.addEventListener('click', () => reviewTopup(btn.dataset.id, 'approved'));
    });

    pendingWalletTopupsContainer.querySelectorAll('.topup-reject-btn').forEach(btn => {
        btn.addEventListener('click', () => reviewTopup(btn.dataset.id, 'rejected'));
    });
}

async function fetchPendingWalletTopups() {
    if (!pendingWalletTopupsContainer) return;
    try {
        const res = await fetch('/api/wallet/topups/pending', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await parseResponse(res);
        if (!res.ok) throw new Error(data.message || 'Failed to fetch top-up requests');
        renderPendingWalletTopups(Array.isArray(data) ? data : []);
    } catch (error) {
        pendingWalletTopupsContainer.innerHTML = `<div class="admin-empty-state">${error.message || 'Failed to load top-up requests'}</div>`;
    }
}

async function reviewTopup(topupId, status) {
    const notes = prompt(`Optional note for ${status}:`) || '';
    const payload = { status, notes };
    if (status === 'approved') {
        const customAmount = prompt('Enter approved credit amount (leave blank to use requested amount):') || '';
        if (customAmount.trim()) payload.credit_amount = customAmount.trim();
    }

    try {
        const res = await fetch(`/api/wallet/topups/${topupId}/review`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        const data = await parseResponse(res);
        if (!res.ok) throw new Error(data.message || 'Failed to review top-up');
        if (window.NextsUI) window.NextsUI.showToast(data.message || 'Top-up reviewed', 'success');
        fetchPendingWalletTopups();
    } catch (error) {
        if (window.NextsUI) window.NextsUI.showToast(error.message || 'Failed to review top-up', 'error');
    }
}

fetchProducts();
fetchOrders();
fetchUsers();
fetchPaymentConfig();
fetchPendingOrderProofs();
fetchPendingWalletTopups();
fetchPasswordResetRequests();
