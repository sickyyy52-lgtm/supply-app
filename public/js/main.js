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
          <button class="add-cart-btn">Add to Cart</button>
        </div>
      </div>
    `;

        const btn = card.querySelector('.add-cart-btn');
        btn.addEventListener('click', () => addToCart(product, btn));

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