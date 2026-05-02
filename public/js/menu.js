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
const productSearchInput = document.getElementById('product-search-input');
const productCategoryFilter = document.getElementById('product-category-filter');
const productMinPriceInput = document.getElementById('product-min-price');
const productMaxPriceInput = document.getElementById('product-max-price');

let menuAllProducts = [];
let menuCurrentCategoryKey = 'all';
let menuCurrentSearch = '';
let menuCurrentMinPrice = '';
let menuCurrentMaxPrice = '';
let menuCurrentCart = { items: [] };
let menuSearchDebounceTimer = null;

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
    drinks: 'beverages',

    seeds: 'seeds',
    seed: 'seeds'
};

const CATEGORY_API_LABELS = {
    all: 'All',
    dairy: 'Dairy',
    vegetables: 'Vegetables',
    grocery: 'Grocery',
    beverages: 'Beverages',
    seeds: 'Seeds'
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

function debounceMenuFetch() {
    clearTimeout(menuSearchDebounceTimer);
    menuSearchDebounceTimer = setTimeout(() => {
        menuFetchProducts();
    }, 300);
}

function buildProductQueryString() {
    const params = new URLSearchParams();
    const categoryLabel = CATEGORY_API_LABELS[menuCurrentCategoryKey] || menuCurrentCategoryKey;

    if (menuCurrentSearch.trim()) {
        params.set('search', menuCurrentSearch.trim());
    }

    if (categoryLabel && categoryLabel !== 'All') {
        params.set('category', categoryLabel);
    }

    if (menuCurrentMinPrice.trim()) {
        params.set('minPrice', menuCurrentMinPrice.trim());
    }

    if (menuCurrentMaxPrice.trim()) {
        params.set('maxPrice', menuCurrentMaxPrice.trim());
    }

    const queryString = params.toString();
    return queryString ? `?${queryString}` : '';
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
        btn.addEventListener('click', () => menuAddToCart(product, btn));
        const whatsappBtn = card.querySelector('.wa-icon-btn');
        whatsappBtn.addEventListener('click', () => {
            if (window.NextsUI) window.NextsUI.openWhatsAppOrder(product);
        });

        menuProductsContainer.appendChild(card);
    });

    if (window.NextsUI) {
        window.NextsUI.applyImageFallbacks();
    }

    menuRevealOnScroll();
}

async function menuFetchProducts() {
    menuRenderSkeletons();
    menuSkeletonContainer.classList.remove('hidden');
    menuProductsContainer.classList.add('hidden');

    try {
        const res = await fetch(`/api/products${buildProductQueryString()}`);
        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || 'Failed to load products');
        }

        menuAllProducts = Array.isArray(data) ? data : [];

        menuSkeletonContainer.classList.add('hidden');
        menuProductsContainer.classList.remove('hidden');

        menuRenderProducts(menuAllProducts);
    } catch (error) {
        console.error('Failed to load products:', error);
        menuSkeletonContainer.innerHTML = `
      <div style="grid-column:1/-1; background:white; padding:24px; border-radius:20px;">
          ${error.message || 'Failed to load products.'}
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

        if (productCategoryFilter) {
            productCategoryFilter.value = CATEGORY_API_LABELS[key] || 'All';
        }

        debounceMenuFetch();
    });
});

if (menuSearchInput) {
    menuSearchInput.addEventListener('input', (e) => {
        menuCurrentSearch = e.target.value;
        if (productSearchInput) productSearchInput.value = menuCurrentSearch;
        debounceMenuFetch();
    });
}

if (productSearchInput) {
    productSearchInput.addEventListener('input', (e) => {
        menuCurrentSearch = e.target.value;
        if (menuSearchInput) menuSearchInput.value = menuCurrentSearch;
        debounceMenuFetch();
    });
}

if (productCategoryFilter) {
    productCategoryFilter.addEventListener('change', (e) => {
        const selectedKey = categoryToKey(e.target.value);
        menuCurrentCategoryKey = selectedKey === 'all' ? 'all' : selectedKey;

        menuCategoryButtons.forEach(btn => {
            btn.classList.toggle('active', (btn.dataset.key || 'all') === menuCurrentCategoryKey);
        });

        debounceMenuFetch();
    });
}

if (productMinPriceInput) {
    productMinPriceInput.addEventListener('input', (e) => {
        menuCurrentMinPrice = e.target.value;
        debounceMenuFetch();
    });
}

if (productMaxPriceInput) {
    productMaxPriceInput.addEventListener('input', (e) => {
        menuCurrentMaxPrice = e.target.value;
        debounceMenuFetch();
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
