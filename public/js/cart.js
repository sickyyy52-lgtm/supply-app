const cartItemsContainer = document.getElementById('cart-items');
const cartTotal = document.getElementById('cart-total');
const cartSubtotal = document.getElementById('cart-subtotal');
const cartHandling = document.getElementById('cart-handling');
const placeOrderBtn = document.getElementById('place-order-btn');
const cartItemsCount = document.getElementById('cart-items-count');
const cartLoginLink = document.getElementById('cart-login-link');
const cartDashboardLink = document.getElementById('cart-dashboard-link');
const upiConfigCard = document.getElementById('upi-config-card');
const upiProofCard = document.getElementById('upi-proof-card');
const checkoutUpiId = document.getElementById('checkout-upi-id');
const checkoutUpiQr = document.getElementById('checkout-upi-qr');
const paymentScreenshotInput = document.getElementById('payment_screenshot');
const isSubscriptionInput = document.getElementById('is_subscription');

const HANDLING_CHARGE = 0;
let currentCart = { items: [] };

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

function setupPaymentSelection() {
    const paymentOptions = document.querySelectorAll('.payment-option');

    paymentOptions.forEach((option) => {
        option.addEventListener('click', () => {
            paymentOptions.forEach((entry) => entry.classList.remove('active-payment'));
            option.classList.add('active-payment');

            const radio = option.querySelector('input');
            if (radio) {
                radio.checked = true;
            }

            updatePaymentVisibility();
        });
    });
}

function getSelectedPaymentMethod() {
    const selected = document.querySelector('input[name="payment_method"]:checked');
    if (selected) {
        return selected.value;
    }
    return 'Cash on Delivery';
}

function updatePaymentVisibility() {
    const method = getSelectedPaymentMethod();
    const showUpi = method === 'UPI';
    if (upiConfigCard) upiConfigCard.classList.toggle('hidden', !showUpi);
    if (upiProofCard) upiProofCard.classList.toggle('hidden', !showUpi);
}

async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read payment screenshot'));
        reader.readAsDataURL(file);
    });
}

async function fetchPaymentConfig() {
    try {
        const res = await fetch('/api/payments/config');
        const config = await res.json();
        if (!config) {
            if (checkoutUpiId) checkoutUpiId.textContent = 'Not configured yet';
            return;
        }

        if (checkoutUpiId) checkoutUpiId.textContent = config.upi_id || 'Not available';
        if (checkoutUpiQr && config.qr_image_url) {
            checkoutUpiQr.src = config.qr_image_url;
            checkoutUpiQr.style.display = 'block';
        }
    } catch (error) {
        if (checkoutUpiId) checkoutUpiId.textContent = 'Unable to load UPI details';
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

        placeOrderBtn.textContent = 'Placing Order...';
        placeOrderBtn.disabled = true;

        try {
            let paymentProofBase64 = null;
            if (payment_method === 'UPI') {
                const selectedFile = paymentScreenshotInput ? paymentScreenshotInput.files[0] : null;
                if (!selectedFile) {
                    if (window.NextsUI) {
                        window.NextsUI.showToast('Please upload payment screenshot for UPI orders', 'error');
                    }
                    placeOrderBtn.textContent = 'Place Order';
                    placeOrderBtn.disabled = false;
                    return;
                }
                paymentProofBase64 = await fileToBase64(selectedFile);
            }

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
                    delivery_slot,
                    payment_proof_base64: paymentProofBase64
                })
            });

            const data = await res.json();

            if (res.ok) {
                await window.NextsUI.clearCart();
                currentCart = { items: [] };

                const orderId = data.orderId;

                if (!orderId) {
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
                    window.location.href = `/invoice.html?orderId=${orderId}`;
                }
            } else if (window.NextsUI) {
                window.NextsUI.showToast(data.message || 'Failed to place order', 'error');
            }
        } catch (error) {
            if (window.NextsUI) {
                window.NextsUI.showToast(error.message || 'Server error while placing order', 'error');
            }
        } finally {
            placeOrderBtn.textContent = 'Place Order';
            placeOrderBtn.disabled = false;
        }
    });
}

updateNavbarState();
setupPaymentSelection();
updatePaymentVisibility();
fetchPaymentConfig();

(async() => {
    try {
        await syncCart();
    } catch (error) {
        if (window.NextsUI && window.NextsUI.getAuthToken()) {
            window.NextsUI.showToast(error.message || 'Failed to load cart', 'error');
        }
    } finally {
        renderCart();
    }
})();