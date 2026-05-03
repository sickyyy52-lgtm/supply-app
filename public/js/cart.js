const cartItemsContainer = document.getElementById('cart-items');
const cartTotal = document.getElementById('cart-total');
const cartSubtotal = document.getElementById('cart-subtotal');
const cartHandling = document.getElementById('cart-handling');
const placeOrderBtn = document.getElementById('place-order-btn');
const cartItemsCount = document.getElementById('cart-items-count');
const cartLoginLink = document.getElementById('cart-login-link');
const cartDashboardLink = document.getElementById('cart-dashboard-link');
const upiConfigCard = document.getElementById('upi-config-card');
const codPaymentCard = document.getElementById('cod-payment-card');
const walletPaymentCard = document.getElementById('wallet-payment-card');
const paymentMethodOptions = document.querySelectorAll('.payment-method-option');
const walletOptionMeta = document.getElementById('wallet-option-meta');
const checkoutWalletBalance = document.getElementById('checkout-wallet-balance');
const checkoutWalletStatus = document.getElementById('checkout-wallet-status');
const isSubscriptionInput = document.getElementById('is_subscription');

const NEXTS_UPI_ID = '9579544462@ptyes';
const NEXTS_PAYEE_NAME = 'Nexts';
const UPI_CHECKOUT_KEY = 'nexts_upi_checkout';
const HANDLING_CHARGE = 0;
let currentCart = { items: [] };
let walletBalance = 0;
let walletLoaded = false;

function getCartItems() {
    return Array.isArray(currentCart.items) ? currentCart.items : [];
}

async function syncCart() {
    if (!window.NextsUI) {
        currentCart = { items: [] };
        return;
    }

    const token = window.NextsUI.getAuthToken();
    if (!token) {
        currentCart = { items: [] };
        return;
    }

    currentCart = await window.NextsUI.fetchCart();
}

async function persistCartItems(items) {
    if (!window.NextsUI) {
        throw new Error('Cart service unavailable');
    }

    currentCart = await window.NextsUI.saveCartItems(items.map((item) => ({
        product_id: Number(item.product_id || item.id),
        quantity: Number(item.quantity || 0)
    })));
}

function updateNavbarState() {
    const token = localStorage.getItem('token');

    if (token) {
        cartLoginLink.textContent = 'Account';
        cartLoginLink.href = '/dashboard';
        if (cartDashboardLink) cartDashboardLink.classList.remove('hidden');
    } else {
        cartLoginLink.textContent = 'Login';
        cartLoginLink.href = '/login';
        if (cartDashboardLink) cartDashboardLink.classList.add('hidden');
    }
}

function getSelectedPaymentMethod() {
    const selected = document.querySelector('input[name="payment_method"]:checked');
    return selected ? selected.value : 'UPI';
}

function setSelectedPaymentMethod(method) {
    paymentMethodOptions.forEach((option) => {
        const input = option.querySelector('input[name="payment_method"]');
        const isSelected = input && input.value === method;
        option.classList.toggle('active-payment', isSelected);
        if (input) input.checked = isSelected;
    });
}

function getCartTotal() {
    const subtotal = getCartItems().reduce((sum, item) => sum + Number(item.price) * Number(item.quantity || 0), 0);
    return Number((subtotal + HANDLING_CHARGE).toFixed(2));
}

async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read payment screenshot'));
        reader.readAsDataURL(file);
    });
}

async function fetchWalletBalance() {
    const token = localStorage.getItem('token');
    if (!token) {
        walletLoaded = false;
        walletBalance = 0;
        return;
    }

    try {
        const res = await fetch('/api/wallet/me', {
            headers: { Authorization: 'Bearer ' + token }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to load wallet');

        walletBalance = Number(data.balance || 0);
        walletLoaded = true;
    } catch (error) {
        walletLoaded = false;
        walletBalance = 0;
        if (window.NextsUI) window.NextsUI.showToast(error.message || 'Failed to load wallet balance', 'error');
    }
}

function buildUpiPaymentString(amount, orderId) {
    return [
        `upi://pay?pa=${NEXTS_UPI_ID}`,
        `pn=${encodeURIComponent(NEXTS_PAYEE_NAME)}`,
        `am=${Number(amount || 0).toFixed(2)}`,
        'cu=INR',
        `tn=${encodeURIComponent(String(orderId))}`
    ].join('&');
}

function createQrSvgDataUrl(text) {
    const version = 5;
    const size = 17 + 4 * version;
    const dataCodewords = 108;
    const eccCodewords = 26;
    const mask = 0;
    const bytes = Array.from(new TextEncoder().encode(text));

    if (bytes.length > 106) {
        throw new Error('UPI QR payload is too long');
    }

    const dataBits = [];
    const appendBits = (value, length) => {
        for (let bit = length - 1; bit >= 0; bit--) {
            dataBits.push((value >>> bit) & 1);
        }
    };

    appendBits(0x4, 4);
    appendBits(bytes.length, 8);
    bytes.forEach((byte) => appendBits(byte, 8));

    const capacityBits = dataCodewords * 8;
    for (let i = 0; i < 4 && dataBits.length < capacityBits; i++) dataBits.push(0);
    while (dataBits.length % 8) dataBits.push(0);

    const data = [];
    for (let i = 0; i < dataBits.length; i += 8) {
        data.push(dataBits.slice(i, i + 8).reduce((value, bit) => (value << 1) | bit, 0));
    }

    const padBytes = [0xec, 0x11];
    let padIndex = 0;
    while (data.length < dataCodewords) {
        data.push(padBytes[padIndex % 2]);
        padIndex++;
    }

    const exp = new Array(512);
    const log = new Array(256);
    let value = 1;
    for (let i = 0; i < 255; i++) {
        exp[i] = value;
        log[value] = i;
        value <<= 1;
        if (value & 0x100) value ^= 0x11d;
    }
    for (let i = 255; i < exp.length; i++) exp[i] = exp[i - 255];

    const multiply = (left, right) => {
        if (!left || !right) return 0;
        return exp[log[left] + log[right]];
    };

    const multiplyPolynomials = (left, right) => {
        const result = new Array(left.length + right.length - 1).fill(0);
        left.forEach((leftValue, leftIndex) => {
            right.forEach((rightValue, rightIndex) => {
                result[leftIndex + rightIndex] ^= multiply(leftValue, rightValue);
            });
        });
        return result;
    };

    let generator = [1];
    for (let i = 0; i < eccCodewords; i++) {
        generator = multiplyPolynomials(generator, [1, exp[i]]);
    }

    const ecc = new Array(eccCodewords).fill(0);
    data.forEach((byte) => {
        const factor = byte ^ ecc[0];
        ecc.shift();
        ecc.push(0);
        for (let i = 0; i < eccCodewords; i++) {
            ecc[i] ^= multiply(generator[i + 1], factor);
        }
    });

    const codewords = data.concat(ecc);
    const modules = Array.from({ length: size }, () => Array(size).fill(false));
    const reserved = Array.from({ length: size }, () => Array(size).fill(false));

    const setFunctionModule = (row, col, isDark) => {
        if (row < 0 || col < 0 || row >= size || col >= size) return;
        modules[row][col] = !!isDark;
        reserved[row][col] = true;
    };

    const drawFinder = (row, col) => {
        for (let dy = -1; dy <= 7; dy++) {
            for (let dx = -1; dx <= 7; dx++) {
                const moduleRow = row + dy;
                const moduleCol = col + dx;
                const inFinder = dy >= 0 && dy <= 6 && dx >= 0 && dx <= 6;
                const isDark = inFinder && (
                    dy === 0 || dy === 6 || dx === 0 || dx === 6 ||
                    (dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4)
                );
                setFunctionModule(moduleRow, moduleCol, isDark);
            }
        }
    };

    drawFinder(0, 0);
    drawFinder(0, size - 7);
    drawFinder(size - 7, 0);

    for (let i = 8; i < size - 8; i++) {
        const isDark = i % 2 === 0;
        setFunctionModule(6, i, isDark);
        setFunctionModule(i, 6, isDark);
    }

    for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
            const distance = Math.max(Math.abs(dx), Math.abs(dy));
            setFunctionModule(30 + dy, 30 + dx, distance === 0 || distance === 2);
        }
    }

    const drawFormatBits = (isReserveOnly = false) => {
        const dataValue = (1 << 3) | mask;
        let remainder = dataValue;
        for (let i = 0; i < 10; i++) {
            remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) ? 0x537 : 0);
        }
        const bits = ((dataValue << 10) | remainder) ^ 0x5412;
        const getBit = (index) => !isReserveOnly && (((bits >>> index) & 1) === 1);

        for (let i = 0; i <= 5; i++) setFunctionModule(8, i, getBit(i));
        setFunctionModule(8, 7, getBit(6));
        setFunctionModule(8, 8, getBit(7));
        setFunctionModule(7, 8, getBit(8));
        for (let i = 9; i < 15; i++) setFunctionModule(14 - i, 8, getBit(i));
        for (let i = 0; i < 8; i++) setFunctionModule(size - 1 - i, 8, getBit(i));
        for (let i = 8; i < 15; i++) setFunctionModule(8, size - 15 + i, getBit(i));
        setFunctionModule(size - 8, 8, !isReserveOnly);
    };

    drawFormatBits(true);

    const allBits = [];
    codewords.forEach((byte) => {
        for (let bit = 7; bit >= 0; bit--) allBits.push(((byte >>> bit) & 1) === 1);
    });

    let bitIndex = 0;
    let upward = true;
    for (let col = size - 1; col > 0; col -= 2) {
        if (col === 6) col--;

        for (let rowStep = 0; rowStep < size; rowStep++) {
            const row = upward ? size - 1 - rowStep : rowStep;

            for (let offset = 0; offset < 2; offset++) {
                const moduleCol = col - offset;
                if (reserved[row][moduleCol]) continue;

                let isDark = bitIndex < allBits.length ? allBits[bitIndex] : false;
                bitIndex++;

                if ((row + moduleCol) % 2 === 0) isDark = !isDark;
                modules[row][moduleCol] = isDark;
            }
        }

        upward = !upward;
    }

    drawFormatBits(false);

    const quietZone = 4;
    const dimension = size + quietZone * 2;
    let path = '';
    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            if (modules[row][col]) {
                path += `M${col + quietZone},${row + quietZone}h1v1h-1z`;
            }
        }
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function syncPaymentSection() {
    const amount = getCartTotal();
    const cart = getCartItems();
    let method = getSelectedPaymentMethod();

    const walletInput = document.querySelector('input[name="payment_method"][value="Wallet"]');
    const walletOption = walletInput ? walletInput.closest('.payment-method-option') : null;
    const walletEnough = walletLoaded && walletBalance >= amount && amount > 0;

    if (checkoutWalletBalance) checkoutWalletBalance.textContent = walletBalance.toFixed(2);
    if (walletOptionMeta) {
        walletOptionMeta.textContent = walletLoaded ? `₹${walletBalance.toFixed(2)} available` : 'Login to check';
    }
    if (checkoutWalletStatus) {
        checkoutWalletStatus.textContent = walletEnough ?
            'Balance is sufficient. Wallet will be deducted automatically.' :
            'Insufficient balance. Please choose UPI or COD.';
    }
    if (walletInput) walletInput.disabled = !walletEnough;
    if (walletOption) walletOption.classList.toggle('payment-option-disabled', !walletEnough);

    if (method === 'Wallet' && !walletEnough) {
        method = 'UPI';
        setSelectedPaymentMethod(method);
    }

    if (upiConfigCard) upiConfigCard.classList.toggle('hidden', method !== 'UPI');
    if (codPaymentCard) codPaymentCard.classList.toggle('hidden', method !== 'COD');
    if (walletPaymentCard) walletPaymentCard.classList.toggle('hidden', method !== 'Wallet');

    if (placeOrderBtn) {
        if (method === 'COD') {
            placeOrderBtn.textContent = 'Place COD Order';
        } else if (method === 'Wallet') {
            placeOrderBtn.textContent = 'Pay with Wallet';
        } else {
            placeOrderBtn.textContent = 'Continue to UPI Payment';
        }
    }
}

function renderCart() {
    const cart = getCartItems();
    cartItemsContainer.innerHTML = '';

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = `
      <div class="cart-empty-state">
        <h3>Your cart is empty</h3>
        <p>Add products from Nexts homepage to create your next business supply order.</p>
        <a href="/menu" class="empty-cart-btn">Explore Menu</a>
      </div>
    `;
        cartSubtotal.textContent = '0.00';
        cartTotal.textContent = '0.00';
        cartHandling.textContent = '0.00';
        cartItemsCount.textContent = '0 items in your order';
        syncPaymentSection();
        return;
    }

    let subtotal = 0;
    let totalItems = 0;

    cart.forEach((item, index) => {
        subtotal += Number(item.price) * item.quantity;
        totalItems += item.quantity;

        const card = document.createElement('div');
        card.className = 'cart-item-card';
        card.style.animationDelay = `${index * 0.05}s`;

        card.innerHTML = `
      <div class="cart-item-image">
        <img src="${item.image}" alt="${item.name}">
      </div>

      <div class="cart-item-content">
        <h3>${item.name}</h3>
        <p class="cart-item-category">${item.category}</p>
        <div class="cart-item-price">Rs ${(Number(item.price) * item.quantity).toFixed(2)}</div>
      </div>

      <div class="cart-item-actions">
        <div class="quantity-box">
          <button class="qty-btn" onclick="updateQuantity(${item.product_id}, -1)">-</button>
          <span class="qty-value">${item.quantity}</span>
          <button class="qty-btn" onclick="updateQuantity(${item.product_id}, 1)">+</button>
        </div>
        <button class="remove-btn" onclick="removeItem(${item.product_id})">Remove</button>
      </div>
    `;

        cartItemsContainer.appendChild(card);
    });

    const finalTotal = subtotal + HANDLING_CHARGE;

    cartSubtotal.textContent = subtotal.toFixed(2);
    cartHandling.textContent = subtotal > 0 ? HANDLING_CHARGE.toFixed(2) : '0.00';
    cartTotal.textContent = finalTotal.toFixed(2);
    cartItemsCount.textContent = `${totalItems} item${totalItems > 1 ? 's' : ''} in your order`;

    if (window.NextsUI) {
        window.NextsUI.applyImageFallbacks();
    }

    syncPaymentSection();
}

window.updateQuantity = function(id, change) {
    (async() => {
        try {
            const cart = getCartItems();
            const nextItems = cart.map((entry) => ({
                product_id: Number(entry.product_id || entry.id),
                quantity: Number(entry.quantity || 0)
            }));

            const target = nextItems.find((entry) => entry.product_id === Number(id));
            if (!target) return;

            target.quantity += change;
            const filtered = nextItems.filter((entry) => entry.quantity > 0);

            await persistCartItems(filtered);
            renderCart();
        } catch (error) {
            if (window.NextsUI) {
                window.NextsUI.showToast(error.message || 'Failed to update cart', 'error');
            }
        }
    })();
};

window.removeItem = function(id) {
    (async() => {
        try {
            const cart = getCartItems()
                .filter((entry) => Number(entry.product_id || entry.id) !== Number(id))
                .map((entry) => ({
                    product_id: Number(entry.product_id || entry.id),
                    quantity: Number(entry.quantity || 0)
                }));

            await persistCartItems(cart);
            renderCart();

            if (window.NextsUI) {
                window.NextsUI.showToast('Item removed from cart', 'info');
            }
        } catch (error) {
            if (window.NextsUI) {
                window.NextsUI.showToast(error.message || 'Failed to update cart', 'error');
            }
        }
    })();
};

if (placeOrderBtn) {
    placeOrderBtn.addEventListener('click', async() => {
        const token = localStorage.getItem('token');

        if (!token) {
            if (window.NextsUI) {
                window.NextsUI.showToast('Please login first to place your order', 'error');
            }
            setTimeout(() => {
                window.location.href = '/login';
            }, 700);
            return;
        }

        const customer_name = document.getElementById('customer_name').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const address = document.getElementById('address').value.trim();
        const payment_method = getSelectedPaymentMethod();
        const is_subscription = !!(isSubscriptionInput && isSubscriptionInput.checked);
        const cart = getCartItems();

        const deliverySlotEl = document.getElementById('delivery_slot');
        const delivery_slot = deliverySlotEl ? deliverySlotEl.value : '';

        if (!customer_name || !phone || !address) {
            if (window.NextsUI) {
                window.NextsUI.showToast('Please fill all delivery details', 'error');
            }
            return;
        }

        if (!cart.length) {
            if (window.NextsUI) {
                window.NextsUI.showToast('Your cart is empty', 'error');
            }
            return;
        }

        const items = cart.map((item) => ({
            product_id: Number(item.product_id || item.id),
            quantity: item.quantity
        }));

        const subtotal = cart.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0);
        const total_price = subtotal + HANDLING_CHARGE;

        if (payment_method === 'Wallet' && (!walletLoaded || walletBalance < total_price)) {
            if (window.NextsUI) window.NextsUI.showToast('Wallet balance is insufficient. Choose UPI or COD.', 'error');
            await syncPaymentSection();
            return;
        }

        if (payment_method === 'UPI') {
            const checkoutPayload = {
                items,
                total_price,
                address,
                phone,
                customer_name,
                payment_method,
                is_subscription,
                delivery_slot,
                created_at: new Date().toISOString()
            };

            sessionStorage.setItem(UPI_CHECKOUT_KEY, JSON.stringify(checkoutPayload));
            placeOrderBtn.textContent = 'Opening UPI Payment...';
            placeOrderBtn.disabled = true;
            window.location.href = '/payment/upi';
            return;
        }

        placeOrderBtn.textContent = 'Placing Order...';
        placeOrderBtn.disabled = true;

        try {
            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: 'Bearer ' + token
                },
                body: JSON.stringify({
                    items,
                    total_price,
                    address,
                    phone,
                    customer_name,
                    payment_method,
                    is_subscription,
                    delivery_slot
                })
            });

            const data = await res.json();

            if (res.ok) {
                await window.NextsUI.clearCart();
                currentCart = { items: [] };

                const placedOrderId = data.orderId;

                if (!placedOrderId) {
                    if (window.NextsUI) {
                        window.NextsUI.showSuccessModal(
                            'Order Placed!',
                            data.message || (`Your order was placed successfully with payment method: ${payment_method}.`),
                            function() {
                                window.location.href = '/dashboard';
                            }
                        );
                    }
                } else {
                    window.location.href = `/invoice.html?orderId=${placedOrderId}`;
                }
            } else if (window.NextsUI) {
                window.NextsUI.showToast(data.message || 'Failed to place order', 'error');
            }
        } catch (error) {
            if (window.NextsUI) {
                window.NextsUI.showToast(error.message || 'Server error while placing order', 'error');
            }
        } finally {
            await syncPaymentSection();
            placeOrderBtn.disabled = false;
        }
    });
}

updateNavbarState();
paymentMethodOptions.forEach((option) => {
    option.addEventListener('click', () => {
        const input = option.querySelector('input[name="payment_method"]');
        if (!input || input.disabled) return;
        setSelectedPaymentMethod(input.value);
        syncPaymentSection();
    });

    const input = option.querySelector('input[name="payment_method"]');
    if (input) {
        input.addEventListener('change', () => {
            if (!input.disabled) {
                setSelectedPaymentMethod(input.value);
                syncPaymentSection();
            }
        });
    }
});
(async() => {
    try {
        await syncCart();
        await fetchWalletBalance();
    } catch (error) {
        if (window.NextsUI && window.NextsUI.getAuthToken()) {
            window.NextsUI.showToast(error.message || 'Failed to load cart', 'error');
        }
    } finally {
        renderCart();
    }
})();
