window.NextsUI = {
    showToast(message, type = 'success', duration = 3000) {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        toast.innerHTML = `
      <div class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '!' : 'i'}</div>
      <div class="toast-text">${message}</div>
    `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('show');
        }, 10);

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
        }, duration);
    },

    showSuccessModal(title, message, callback) {
        const modal = document.getElementById('success-modal');
        const titleEl = document.getElementById('success-modal-title');
        const msgEl = document.getElementById('success-modal-message');
        const btn = document.getElementById('success-modal-btn');

        if (!modal || !titleEl || !msgEl || !btn) return;

        titleEl.textContent = title;
        msgEl.textContent = message;
        modal.classList.remove('hidden');

        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);

        newBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
            if (typeof callback === 'function') callback();
        });
    },

    applyImageFallbacks() {
        const fallbackSrc = '/images/fallback-product.jpg';

        document.querySelectorAll('img').forEach(img => {
            if (img.dataset.fallbackBound === '1') return;
            img.dataset.fallbackBound = '1';

            img.addEventListener('error', function() {
                const current = this.getAttribute('src') || '';

                if (current.includes(fallbackSrc)) return;

                console.warn('Missing image:', current);
                this.src = fallbackSrc;
            });
        });
    },

    getAuthToken() {
        return localStorage.getItem('token');
    },

    async fetchCart() {
        const token = this.getAuthToken();
        if (!token) {
            return { user_id: null, items: [] };
        }

        const res = await fetch('/api/cart', {
            headers: {
                Authorization: 'Bearer ' + token
            }
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.message || 'Failed to load cart');
        }

        return data;
    },

    async saveCartItems(items) {
        const token = this.getAuthToken();
        if (!token) {
            throw new Error('Please login first to use your cart');
        }

        const res = await fetch('/api/cart', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: 'Bearer ' + token
            },
            body: JSON.stringify({ items })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.message || 'Failed to update cart');
        }

        return data.cart;
    },

    async clearCart() {
        const token = this.getAuthToken();
        if (!token) {
            return;
        }

        const res = await fetch('/api/cart', {
            method: 'DELETE',
            headers: {
                Authorization: 'Bearer ' + token
            }
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.message || 'Failed to clear cart');
        }
    },

    getCartItemCount(cart) {
        return (cart.items || []).reduce(
            (sum, item) => sum + Number(item.quantity || 0),
            0
        );
    },

    async addToCart(product) {
        const cart = await this.fetchCart();
        const items = Array.isArray(cart.items) ?
            cart.items.map((item) => ({
                product_id: Number(item.product_id || item.id),
                quantity: Number(item.quantity || 0)
            })) : [];

        const existing = items.find(
            (item) => item.product_id === Number(product.id)
        );
        if (existing) {
            existing.quantity += 1;
        } else {
            items.push({
                product_id: Number(product.id),
                quantity: 1
            });
        }

        return this.saveCartItems(items);
    },

    getStoredUser() {
        try {
            return JSON.parse(localStorage.getItem('user') || 'null');
        } catch {
            return null;
        }
    },

    buildWhatsAppOrderUrl(product, quantity = 1) {
        const messageLines = [
            'Hi, I want to place an order:',
            '',
            `Product: ${product.name}`,
            `Price: ₹${Number(product.price || 0).toFixed(2)}`,
            `Quantity: ${Number(quantity || 1)}`,
            '',
            'Please confirm availability and delivery.'
        ];

        return `https://wa.me/919579544462?text=${encodeURIComponent(messageLines.join('\n'))}`;
    },

    openWhatsAppOrder(product, quantity = 1) {
        window.open(this.buildWhatsAppOrderUrl(product, quantity), '_blank', 'noopener,noreferrer');
    },

    injectGlobalSupportUI() {
        if (document.querySelector('.site-footer')) {
            return;
        }

        const footer = document.createElement('footer');
        footer.className = 'site-footer';
        footer.innerHTML = `
            <div class="site-footer-inner">
                <div class="site-footer-brand">
                    <h3>Nexts</h3>
                    <p>Smart supply for modern businesses</p>
                    <span class="site-footer-copyright">© 2026 Nexts. All rights reserved.</span>
                </div>

                <div class="site-footer-links">
                    <h4>Quick Links</h4>
                    <a href="/">Home</a>
                    <a href="/menu">Products</a>
                    <a href="/cart">Cart</a>
                    <a href="/dashboard">Orders</a>
                    <a href="/admin">Admin</a>
                </div>

                <div class="site-footer-contact">
                    <h4>Contact Us</h4>
                    <a href="mailto:contact@nexts.in">contact@nexts.in</a>
                    <a href="tel:9579544462">9579544462</a>
                    <a href="https://wa.me/919579544462" target="_blank" rel="noopener noreferrer" class="site-footer-whatsapp-link">
                        <span class="site-footer-whatsapp-icon" aria-hidden="true">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.849L.057 23.571a.75.75 0 0 0 .921.921l5.684-1.485A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.933 0-3.742-.523-5.29-1.432l-.38-.224-3.938 1.028 1.01-3.848-.247-.396A9.956 9.956 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                            </svg>
                        </span>
                        <span>Chat on WhatsApp</span>
                    </a>
                </div>
            </div>

            <div class="site-footer-bottom">
                <p>© 2026 Nexts. All rights reserved.</p>
            </div>
        `;

        const anchorTarget =
            document.getElementById('toast-container') ||
            document.body.lastElementChild;
        if (anchorTarget && anchorTarget.parentNode) {
            anchorTarget.parentNode.insertBefore(footer, anchorTarget);
        } else {
            document.body.appendChild(footer);
        }

        const whatsappButton = document.createElement('a');
        whatsappButton.className = 'whatsapp-support-btn';
        whatsappButton.href = 'https://wa.me/919579544462';
        whatsappButton.target = '_blank';
        whatsappButton.rel = 'noopener noreferrer';
        whatsappButton.setAttribute('aria-label', 'Chat with Support');
        whatsappButton.setAttribute('title', 'Chat with Support');
        whatsappButton.innerHTML = `
            <span class="whatsapp-support-icon" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="white">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.849L.057 23.571a.75.75 0 0 0 .921.921l5.684-1.485A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.933 0-3.742-.523-5.29-1.432l-.38-.224-3.938 1.028 1.01-3.848-.247-.396A9.956 9.956 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                </svg>
            </span>
        `;

        document.body.appendChild(whatsappButton);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    if (window.NextsUI) {
        window.NextsUI.injectGlobalSupportUI();
    }
});
