const productsContainer = document.getElementById('products-container');
const skeletonContainer = document.getElementById('skeleton-container');
const categoryButtons = document.querySelectorAll('.cat-btn');
const cartCount = document.getElementById('cart-count');
const floatingCartCount = document.getElementById('floating-cart-count');
const loginLink = document.getElementById('login-link');
const dashboardLink = document.getElementById('dashboard-link');
const adminLink = document.getElementById('admin-link');
const logoutBtn = document.getElementById('logout-btn');
const pageLoader = document.getElementById('page-loader');
const searchInput = document.getElementById('search-input');
const productsHeadingEl = document.getElementById('products-heading');

let allProducts = [];
let currentCategory = 'Dairy Products';
let currentSearch = '';
let currentCart = { items: [] };

/* Category → Heading text map */
const categoryHeadingMap = {
    'All': 'Popular supply picks',
    'Dairy Products': 'Popular dairy supply picks',
    'Vegetables': 'Popular vegetable supply picks',
    'Grocery': 'Popular grocery supply picks',
    'Beverages': 'Popular beverage supply picks'
};

window.addEventListener('load', () => {
    setTimeout(() => {
        if (pageLoader) pageLoader.classList.add('hide');
    }, 700);

    revealOnScroll();

    if (window.NextsUI) {
        window.NextsUI.applyImageFallbacks();
    }
});

function updateNavbar() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || 'null');

    if (token && user) {
        if (loginLink) loginLink.classList.add('hidden');
        if (logoutBtn) logoutBtn.classList.remove('hidden');
        if (dashboardLink) dashboardLink.classList.remove('hidden');

        if (adminLink) {
            if (user.role === 'admin') {
                adminLink.classList.remove('hidden');
            } else {
                adminLink.classList.add('hidden');
            }
        }
    } else {
        if (loginLink) loginLink.classList.remove('hidden');
        if (logoutBtn) logoutBtn.classList.add('hidden');
        if (dashboardLink) dashboardLink.classList.add('hidden');
        if (adminLink) adminLink.classList.add('hidden');
    }
}

function updateCartCount() {
    const totalItems = window.NextsUI ? window.NextsUI.getCartItemCount(currentCart) : 0;
    if (cartCount) cartCount.textContent = totalItems;
    if (floatingCartCount) floatingCartCount.textContent = totalItems;
}

async function syncCartCount() {
    if (!window.NextsUI) return;
    try {
        currentCart = await window.NextsUI.fetchCart();
    } catch {
        currentCart = { items: [] };
    }
    updateCartCount();
}

async function addToCart(product, buttonEl) {
    if (!window.NextsUI || !window.NextsUI.getAuthToken()) {
        if (window.NextsUI) {
            window.NextsUI.showToast('Please login first to use your cart', 'error');
        }
        setTimeout(() => {
            window.location.href = '/login';
        }, 700);
        return;
    }

    try {
        currentCart = await window.NextsUI.addToCart(product);
        updateCartCount();

        if (buttonEl) {
            buttonEl.classList.add('clicked');
            buttonEl.textContent = 'Added';

            setTimeout(() => {
                buttonEl.classList.remove('clicked');
                buttonEl.textContent = 'Add to Cart';
            }, 700);
        }

        window.NextsUI.showToast(`${product.name} added to cart`, 'success');
    } catch (error) {
        window.NextsUI.showToast(error.message || 'Failed to update cart', 'error');
    }
}

function renderSkeletons() {
    if (!skeletonContainer) return;
    skeletonContainer.innerHTML = '';
    for (let i = 0; i < 8; i++) {
        const div = document.createElement('div');
        div.className = 'skeleton';
        skeletonContainer.appendChild(div);
    }
}

function renderProducts(products) {
    if (!productsContainer) return;

    productsContainer.innerHTML = '';

    if (!products.length) {
        productsContainer.innerHTML = `
      <div style="grid-column:1/-1; background:white; padding:28px; border-radius:24px; box-shadow:0 12px 30px rgba(0,0,0,0.08);">
        <h3 style="margin-bottom:8px;">No products found</h3>
        <p style="color:#667085;">Try another category or search keyword.</p>
      </div>
    `;
        return;
    }

    products.forEach((product, index) => {
        const card = document.createElement('div');
        card.className = 'product-card reveal';
        card.style.transitionDelay = `${index * 0.06}s`;

        card.innerHTML = `
      <div class="product-image-wrap">
        <img src="${product.image}" alt="${product.name}" />
        <span class="product-badge">${product.category}</span>
      </div>
      <div class="product-content">
        <div class="product-title-row">
          <h3>${product.name}</h3>
        </div>
        <p class="product-category">Premium quality ${product.category.toLowerCase()}</p>
        <div class="product-price">₹${Number(product.price).toFixed(2)}</div>
        <div class="product-actions">
          <span class="quick-meta">Ready for bulk order</span>
          <div class="product-button-stack">
            <button class="add-cart-btn">Add to Cart</button>
            <button class="wa-icon-btn" type="button" aria-label="Order on WhatsApp">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.849L.057 23.571a.75.75 0 0 0 .921.921l5.684-1.485A11.945 11.945 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.933 0-3.742-.523-5.29-1.432l-.38-.224-3.938 1.028 1.01-3.848-.247-.396A9.956 9.956 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `;

        const btn = card.querySelector('.add-cart-btn');
        btn.addEventListener('click', () => addToCart(product, btn));
        const whatsappBtn = card.querySelector('.wa-icon-btn');
        whatsappBtn.addEventListener('click', () => {
            if (window.NextsUI) window.NextsUI.openWhatsAppOrder(product);
        });

        productsContainer.appendChild(card);
    });

    if (window.NextsUI) {
        window.NextsUI.applyImageFallbacks();
    }

    revealOnScroll();
}

function filterProducts() {
    let filtered = [...allProducts];

    if (currentCategory !== 'All') {
        filtered = filtered.filter(product => product.category === currentCategory);
    }

    if (currentSearch.trim()) {
        const query = currentSearch.toLowerCase();
        filtered = filtered.filter(product =>
            (product.name || '').toLowerCase().includes(query) ||
            (product.category || '').toLowerCase().includes(query)
        );
    }

    renderProducts(filtered);
}

async function fetchProducts() {
    renderSkeletons();

    try {
        const res = await fetch('/api/products');
        const data = await res.json();
        allProducts = Array.isArray(data) ? data : [];

        if (skeletonContainer) skeletonContainer.classList.add('hidden');
        if (productsContainer) productsContainer.classList.remove('hidden');

        filterProducts();
    } catch (error) {
        if (skeletonContainer) {
            skeletonContainer.innerHTML = `
        <div style="grid-column:1/-1; background:white; padding:24px; border-radius:20px;">
          Failed to load products.
        </div>
      `;
        }

        if (window.NextsUI) {
            window.NextsUI.showToast('Failed to load products', 'error');
        }
    }
}

/* Category buttons click */

categoryButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        categoryButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        currentCategory = btn.dataset.category;

        // Update heading text dynamically
        if (productsHeadingEl) {
            const newHeading = categoryHeadingMap[currentCategory] || 'Popular supply picks';
            productsHeadingEl.textContent = newHeading;
        }

        filterProducts();
    });
});

/* Search */

if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value;
        filterProducts();
    });
}

/* Logout */

if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');

        if (window.NextsUI) {
            window.NextsUI.showToast('Logged out successfully', 'info');
        }

        setTimeout(() => {
            location.href = '/login';
        }, 500);
    });
}

/* Reveal on scroll */

function revealOnScroll() {
    const elements = document.querySelectorAll('.reveal, .reveal-right');
    const triggerBottom = window.innerHeight * 0.88;

    elements.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.top < triggerBottom) {
            el.classList.add('active');
        }
    });
}

window.addEventListener('scroll', revealOnScroll);

/* Init */

updateNavbar();
syncCartCount();
fetchProducts();
