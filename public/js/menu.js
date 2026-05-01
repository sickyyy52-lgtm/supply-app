const menuProductsContainer = document.getElementById('menu-products-container');
const menuSkeletonContainer = document.getElementById('menu-skeleton-container');
const menuCategoryButtons = document.querySelectorAll('#menu-category-filters .cat-btn');
const menuCartCount = document.getElementById('menu-cart-count');
const menuFloatingCartCount = document.getElementById('menu-floating-cart-count');
const menuLoginLink = document.getElementById('menu-login-link');
const menuDashboardLink = document.getElementById('menu-dashboard-link');
const menuAdminLink = document.getElementById('menu-admin-link');
const menuLogoutBtn = document.getElementById('menu-logout-btn');
const menuSearchInput = document.getElementById('menu-search-input');

let menuAllProducts = [];
let menuCurrentCategoryKey = 'all';
let menuCurrentSearch = '';
let menuCurrentCart = { items: [] };

/**
 * Map DB category text -> stable key
 * Whatever is actually saved in Mongo (Dairy, dairy, Dairy Products, etc.)
 * will be normalized through this.
 */
const CATEGORY_MAP = {
    dairy: 'dairy',
    'dairy products': 'dairy',
    'milk & dairy': 'dairy',
    milk: 'dairy',

    vegetables: 'vegetables',
    vegetable: 'vegetables',

    grocery: 'grocery',
    groceries: 'grocery',

    beverages: 'beverages',
    drinks: 'beverages'
};

// Normalize helper
function normalize(str) {
    return String(str || '').trim().toLowerCase();
}

// Convert a DB category string into a key from CATEGORY_MAP
function categoryToKey(cat) {
    const norm = normalize(cat);
    return CATEGORY_MAP[norm] || norm; // if not known, use text itself
}

window.addEventListener('load', () => {
    if (window.NextsUI) {
        window.NextsUI.applyImageFallbacks();
    }
    menuRevealOnScroll();
});

function menuUpdateNavbar() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user'));

    if (token && user) {
        menuLoginLink.classList.add('hidden');
        menuLogoutBtn.classList.remove('hidden');
        menuDashboardLink.classList.remove('hidden');

        if (user.role === 'admin') {
            menuAdminLink.classList.remove('hidden');
        } else {
            menuAdminLink.classList.add('hidden');
        }
    } else {
        menuLoginLink.classList.remove('hidden');
        menuLogoutBtn.classList.add('hidden');
        menuDashboardLink.classList.add('hidden');
        menuAdminLink.classList.add('hidden');
    }
}

function menuUpdateCartCount() {
    const totalItems = window.NextsUI ? window.NextsUI.getCartItemCount(menuCurrentCart) : 0;
    menuCartCount.textContent = totalItems;
    menuFloatingCartCount.textContent = totalItems;
}

async function menuSyncCartCount() {
    if (!window.NextsUI) return;
    try {
        menuCurrentCart = await window.NextsUI.fetchCart();
    } catch (error) {
        menuCurrentCart = { items: [] };
    }
    menuUpdateCartCount();
}

async function menuAddToCart(product, buttonEl) {
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
        menuCurrentCart = await window.NextsUI.addToCart(product);
        menuUpdateCartCount();

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

function menuRenderSkeletons() {
    menuSkeletonContainer.innerHTML = '';
    for (let i = 0; i < 8; i++) {
        const div = document.createElement('div');
        div.className = 'skeleton';
        menuSkeletonContainer.appendChild(div);
    }
}

function menuRenderProducts(products) {
    menuProductsContainer.innerHTML = '';

    if (!products.length) {
        menuProductsContainer.innerHTML = `
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
        card.style.transitionDelay = `${index * 0.05}s`;

        card.innerHTML = `
      <div class="product-image-wrap">
        <img src="${product.image}" alt="${product.name}" />
        <span class="product-badge">${product.category}</span>
      </div>
      <div class="product-content">
        <div class="product-title-row">
          <h3>${product.name}</h3>
        </div>
        <p class="product-category">Premium quality ${String(product.category || '').toLowerCase()}</p>
        <div class="product-price">₹${Number(product.price).toFixed(2)}</div>
        <div class="product-actions">
          <span class="quick-meta">Ready for bulk order</span>
          <button class="add-cart-btn">Add to Cart</button>
        </div>
      </div>
    `;

        const btn = card.querySelector('.add-cart-btn');
        btn.addEventListener('click', () => menuAddToCart(product, btn));

        menuProductsContainer.appendChild(card);
    });

    if (window.NextsUI) {
        window.NextsUI.applyImageFallbacks();
    }

    menuRevealOnScroll();
}

function menuFilterProducts() {
    let filtered = [...menuAllProducts];

    if (menuCurrentCategoryKey !== 'all') {
        const targetKey = menuCurrentCategoryKey;

        filtered = filtered.filter(product => {
            const key = categoryToKey(product.category);
            return key === targetKey;
        });
    }

    if (menuCurrentSearch.trim()) {
        const query = menuCurrentSearch.toLowerCase();
        filtered = filtered.filter(product =>
            product.name.toLowerCase().includes(query) ||
            String(product.category || '').toLowerCase().includes(query)
        );
    }

    menuRenderProducts(filtered);
}

async function menuFetchProducts() {
    menuRenderSkeletons();

    try {
        const res = await fetch('/api/products');
        const data = await res.json();

        // Just to be sure what we are getting
        console.log('Fetched products:', data.map(p => ({
            name: p.name,
            category: p.category
        })));

        menuAllProducts = data;

        menuSkeletonContainer.classList.add('hidden');
        menuProductsContainer.classList.remove('hidden');

        menuFilterProducts();
    } catch (error) {
        console.error('Failed to load products:', error);
        menuSkeletonContainer.innerHTML = `
      <div style="grid-column:1/-1; background:white; padding:24px; border-radius:20px;">
        Failed to load products.
      </div>
    `;

        if (window.NextsUI) {
            window.NextsUI.showToast('Failed to load products', 'error');
        }
    }
}

// CATEGORY BUTTONS
menuCategoryButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        menuCategoryButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const key = btn.dataset.key || 'all';
        menuCurrentCategoryKey = key;

        menuFilterProducts();
    });
});

if (menuSearchInput) {
    menuSearchInput.addEventListener('input', (e) => {
        menuCurrentSearch = e.target.value;
        menuFilterProducts();
    });
}

if (menuLogoutBtn) {
    menuLogoutBtn.addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');

        if (window.NextsUI) {
            window.NextsUI.showToast('Logged out successfully', 'info');
        }

        setTimeout(() => {
            window.location.href = '/login';
        }, 500);
    });
}

function menuRevealOnScroll() {
    const elements = document.querySelectorAll('.reveal, .reveal-right');
    const triggerBottom = window.innerHeight * 0.88;

    elements.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.top < triggerBottom) {
            el.classList.add('active');
        }
    });
}

window.addEventListener('scroll', menuRevealOnScroll);

// INITIALIZE
menuUpdateNavbar();
menuSyncCartCount();
menuFetchProducts();