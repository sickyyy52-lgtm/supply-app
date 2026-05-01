const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user'));
const logoutBtn = document.getElementById('dashboard-logout-btn');

const dashUserName = document.getElementById('dash-user-name');
const dashUserEmail = document.getElementById('dash-user-email');
const dashUserRole = document.getElementById('dash-user-role');
const dashUserPhone = document.getElementById('dash-user-phone');
const dashUserAddress = document.getElementById('dash-user-address');

const dashTotalOrders = document.getElementById('dash-total-orders');
const dashTotalSpend = document.getElementById('dash-total-spend');
const dashAccountType = document.getElementById('dash-account-type');
const dashWalletBalance = document.getElementById('dash-wallet-balance');

const dashboardOrders = document.getElementById('dashboard-orders');
const profileForm = document.getElementById('dashboard-profile-form');
const walletTopupForm = document.getElementById('wallet-topup-form');
const walletTransactionsContainer = document.getElementById('wallet-transactions');
const walletTopupsContainer = document.getElementById('wallet-topups');

const profileName = document.getElementById('profile-name');
const profileEmail = document.getElementById('profile-email');
const profilePhone = document.getElementById('profile-phone');
const profileAddress = document.getElementById('profile-address');
const topupAmountInput = document.getElementById('topup-amount');
const topupScreenshotInput = document.getElementById('topup-screenshot');
const dashboardUpiId = document.getElementById('dashboard-upi-id');
const dashboardUpiQr = document.getElementById('dashboard-upi-qr');

if (!token || !user) {
    window.location.href = '/login';
}

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');

    if (window.NextsUI) {
        window.NextsUI.showToast('Logged out successfully', 'info');
    }

    setTimeout(() => {
        window.location.href = '/login';
    }, 500);
});

async function fetchProfile() {
    try {
        const res = await fetch('/api/auth/me', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const data = await res.json();

        if (!res.ok) {
            if (window.NextsUI) {
                window.NextsUI.showToast(data.message || 'Failed to load profile', 'error');
            }
            dashUserName.textContent = 'Profile Load Failed';
            return;
        }

        dashUserName.textContent = data.name || '-';
        dashUserEmail.textContent = data.email || '-';
        dashUserRole.textContent = data.role || 'user';
        dashUserPhone.textContent = data.phone || '-';
        dashUserAddress.textContent = data.address || '-';
        dashAccountType.textContent = data.role || 'user';

        profileName.value = data.name || '';
        profileEmail.value = data.email || '';
        profilePhone.value = data.phone || '';
        profileAddress.value = data.address || '';

        localStorage.setItem('user', JSON.stringify({
            ...user,
            name: data.name,
            email: data.email,
            role: data.role,
            phone: data.phone || '',
            address: data.address || ''
        }));
    } catch (error) {
        dashUserName.textContent = 'Profile Load Failed';
        if (window.NextsUI) {
            window.NextsUI.showToast('Failed to load profile', 'error');
        }
    }
}

async function fetchOrders() {
    try {
        const res = await fetch('/api/orders', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const orders = await res.json();

        if (!res.ok) {
            if (window.NextsUI) {
                window.NextsUI.showToast('Failed to load orders', 'error');
            }
            return;
        }

        dashboardOrders.innerHTML = '';

        if (!orders.length) {
            dashboardOrders.innerHTML = `
        <div class="dashboard-empty-state">
          No orders found yet.
        </div>
      `;
            dashTotalOrders.textContent = '0';
            dashTotalSpend.textContent = '0.00';
            return;
        }

        let totalSpend = 0;
        dashTotalOrders.textContent = orders.length;

        orders.forEach(order => {
            totalSpend += Number(order.total_price || 0);

            const itemsHtml = (order.items || []).map(item => `
        <li>${item.name} — Qty: ${item.quantity} — ₹${Number(item.price).toFixed(2)}</li>
      `).join('');

            const card = document.createElement('div');
            card.className = 'dashboard-order-card';

            card.innerHTML = `
        <div class="dashboard-order-top">
          <h3>Order #${order.id}</h3>
          <span>₹${Number(order.total_price).toFixed(2)}</span>
        </div>

        <div class="dashboard-order-meta">
          <p><strong>Name:</strong> ${order.customer_name}</p>
          <p><strong>Phone:</strong> ${order.phone}</p>
          <p><strong>Address:</strong> ${order.address}</p>
          <p><strong>Date:</strong> ${order.created_at ? new Date(order.created_at).toLocaleString() : '-'}</p>
          <p><strong>Delivery Slot:</strong> ${
            order.delivery_slot === 'morning' ? 'Morning (6–9 AM)' :
            order.delivery_slot === 'afternoon' ? 'Afternoon (12–3 PM)' :
            order.delivery_slot === 'evening' ? 'Evening (5–8 PM)' :
            'Any'
          }</p>
          <p><strong>Payment:</strong> ${order.payment_method || 'Cash on Delivery'}</p>
          <p><strong>Payment Status:</strong> ${order.payment_status || 'not_required'}</p>
          <p><strong>Subscription:</strong> ${order.is_subscription ? 'Yes' : 'No'}</p>
        </div>

        <div class="dashboard-order-items">
          <h4>Items</h4>
          <ul>${itemsHtml || '<li>No items found</li>'}</ul>
        </div>

        <div class="admin-order-quick-actions" style="margin-top:10px;">
          <button class="admin-btn quick-status-btn"
                  onclick="window.location.href='/invoice.html?orderId=${order.id}'">
            View Invoice
          </button>
        </div>
      `;

            dashboardOrders.appendChild(card);
        });

        dashTotalSpend.textContent = totalSpend.toFixed(2);
    } catch (error) {
        if (window.NextsUI) {
            window.NextsUI.showToast('Failed to load orders', 'error');
        }
    }
}

async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

function renderWalletTransactions(transactions) {
    if (!walletTransactionsContainer) return;
    walletTransactionsContainer.innerHTML = '';

    if (!transactions.length) {
        walletTransactionsContainer.innerHTML = '<div class="dashboard-empty-state">No wallet transactions yet.</div>';
        return;
    }

    transactions.forEach(txn => {
        const card = document.createElement('div');
        card.className = 'dashboard-order-card';
        card.innerHTML = `
      <div class="dashboard-order-top">
        <h3>${txn.type === 'credit' ? 'Credit' : 'Debit'}</h3>
        <span>₹${Number(txn.amount || 0).toFixed(2)}</span>
      </div>
      <div class="dashboard-order-meta">
        <p><strong>Reason:</strong> ${txn.reason || '-'}</p>
        <p><strong>Reference:</strong> ${txn.reference_type || '-'} ${txn.reference_id || ''}</p>
        <p><strong>Date:</strong> ${txn.created_at ? new Date(txn.created_at).toLocaleString() : '-'}</p>
      </div>
    `;
        walletTransactionsContainer.appendChild(card);
    });
}

function renderWalletTopups(topups) {
    if (!walletTopupsContainer) return;
    walletTopupsContainer.innerHTML = '';

    if (!topups.length) {
        walletTopupsContainer.innerHTML = '<div class="dashboard-empty-state">No top-up requests yet.</div>';
        return;
    }

    topups.forEach(topup => {
        const card = document.createElement('div');
        card.className = 'dashboard-order-card';
        card.innerHTML = `
      <div class="dashboard-order-top">
        <h3>Top-up #${topup.id}</h3>
        <span>${topup.status}</span>
      </div>
      <div class="dashboard-order-meta">
        <p><strong>Requested:</strong> ₹${Number(topup.requested_amount || 0).toFixed(2)}</p>
        <p><strong>Admin Note:</strong> ${topup.admin_notes || '-'}</p>
        <p><strong>Created:</strong> ${topup.created_at ? new Date(topup.created_at).toLocaleString() : '-'}</p>
      </div>
    `;
        walletTopupsContainer.appendChild(card);
    });
}

async function fetchWallet() {
    try {
        const res = await fetch('/api/wallet/me', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || 'Failed to load wallet');
        }

        if (dashWalletBalance) dashWalletBalance.textContent = Number(data.balance || 0).toFixed(2);
        renderWalletTransactions(data.transactions || []);
        renderWalletTopups(data.topups || []);
    } catch (error) {
        if (window.NextsUI) {
            window.NextsUI.showToast(error.message || 'Failed to load wallet', 'error');
        }
    }
}

async function fetchPaymentConfigForTopup() {
    try {
        const res = await fetch('/api/payments/config');
        const config = await res.json();
        if (!config) {
            if (dashboardUpiId) dashboardUpiId.textContent = 'Not configured yet';
            return;
        }
        if (dashboardUpiId) dashboardUpiId.textContent = config.upi_id || 'Not available';
        if (dashboardUpiQr && config.qr_image_url) {
            dashboardUpiQr.src = config.qr_image_url;
            dashboardUpiQr.style.display = 'block';
        }
    } catch (error) {
        if (dashboardUpiId) dashboardUpiId.textContent = 'Unable to load UPI details';
    }
}

profileForm.addEventListener('submit', async(e) => {
    e.preventDefault();

    const payload = {
        name: profileName.value.trim(),
        phone: profilePhone.value.trim(),
        address: profileAddress.value.trim()
    };

    try {
        const res = await fetch('/api/auth/profile', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (!res.ok) {
            if (window.NextsUI) {
                window.NextsUI.showToast(data.message || 'Failed to update profile', 'error');
            }
            return;
        }

        if (window.NextsUI) {
            window.NextsUI.showToast('Profile updated successfully', 'success');
        }

        fetchProfile();
    } catch (error) {
        if (window.NextsUI) {
            window.NextsUI.showToast('Server error while updating profile', 'error');
        }
    }
});

if (walletTopupForm) {
    walletTopupForm.addEventListener('submit', async(e) => {
        e.preventDefault();

        const amount = topupAmountInput ? topupAmountInput.value.trim() : '';
        const file = topupScreenshotInput ? topupScreenshotInput.files[0] : null;

        if (!amount || !file) {
            if (window.NextsUI) {
                window.NextsUI.showToast('Please enter amount and upload screenshot', 'error');
            }
            return;
        }

        try {
            const imageBase64 = await fileToBase64(file);
            const res = await fetch('/api/wallet/topups', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    requested_amount: amount,
                    image_base64: imageBase64
                })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || 'Failed to submit top-up request');
            }

            walletTopupForm.reset();
            if (window.NextsUI) {
                window.NextsUI.showToast(data.message || 'Top-up request submitted', 'success');
            }
            fetchWallet();
        } catch (error) {
            if (window.NextsUI) {
                window.NextsUI.showToast(error.message || 'Failed to submit top-up request', 'error');
            }
        }
    });
}

fetchProfile();
fetchOrders();
fetchWallet();
fetchPaymentConfigForTopup();