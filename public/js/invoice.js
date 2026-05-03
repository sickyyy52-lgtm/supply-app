(function() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || 'null');

    if (!token || !user) {
        window.location.href = '/login';
        return;
    }

    function getQueryParam(name) {
        const params = new URLSearchParams(window.location.search);
        return params.get(name);
    }

    async function parseResponse(res) {
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) return res.json();
        const text = await res.text();
        throw new Error(text || 'Unexpected server response');
    }

    function formatPaymentMethod(method) {
        if (method === 'COD' || method === 'Cash on Delivery') return 'COD';
        return method || '—';
    }

    function formatPaymentStatus(status) {
        return String(status || '—').replace(/_/g, ' ');
    }

    const orderId = getQueryParam('orderId');
    const els = {
        id: document.getElementById('invoice-id'),
        date: document.getElementById('invoice-date'),
        name: document.getElementById('invoice-customer-name'),
        phone: document.getElementById('invoice-customer-phone'),
        addr: document.getElementById('invoice-customer-address'),
        payMethod: document.getElementById('invoice-payment-method'),
        payStatus: document.getElementById('invoice-payment-status'),
        sub: document.getElementById('invoice-subscription'),
        slot: document.getElementById('invoice-delivery-slot'),
        itemsBody: document.getElementById('invoice-items-body'),
        subtotal: document.getElementById('invoice-subtotal'),
        handling: document.getElementById('invoice-handling'),
        total: document.getElementById('invoice-total'),
        backBtn: document.getElementById('invoice-back-btn'),
        printBtn: document.getElementById('invoice-print-btn')
    };

    if (!orderId) {
        els.itemsBody.innerHTML =
            '<tr><td colspan="4" style="text-align:center; padding:16px; color:#ef4444;">Missing orderId in URL.</td></tr>';
        return;
    }

    async function loadInvoice() {
        try {
            const res = await fetch(`/api/orders/${orderId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await parseResponse(res);
            if (!res.ok) throw new Error(data.message || 'Failed to fetch order');

            els.id.textContent = `#${data.id}`;
            els.date.textContent = data.created_at ?
                new Date(data.created_at).toLocaleString() :
                '—';

            els.name.textContent = data.customer_name || '—';
            els.phone.textContent = data.phone || '—';
            els.addr.textContent = data.address || '—';

            els.payMethod.textContent = formatPaymentMethod(data.payment_method);
            els.payStatus.textContent = formatPaymentStatus(data.payment_status);
            els.sub.textContent = data.is_subscription ? 'Yes (Subscription)' : 'No';

            els.slot.textContent =
                data.delivery_slot === 'morning' ? 'Morning (6–9 AM)' :
                data.delivery_slot === 'afternoon' ? 'Afternoon (12–3 PM)' :
                data.delivery_slot === 'evening' ? 'Evening (5–8 PM)' :
                'Any';

            const items = Array.isArray(data.items) ? data.items : [];
            if (!items.length) {
                els.itemsBody.innerHTML =
                    '<tr><td colspan="4" style="text-align:center; padding:16px; color:#ef4444;">No items found for this order.</td></tr>';
            } else {
                els.itemsBody.innerHTML = items
                    .map((item) => {
                        const qty = Number(item.quantity || 0);
                        const price = Number(item.price || 0);
                        const lineTotal = qty * price;
                        return `
              <tr>
                <td>${item.name || '-'}</td>
                <td class="qty">${qty}</td>
                <td class="price">₹${price.toFixed(2)}</td>
                <td class="total">₹${lineTotal.toFixed(2)}</td>
              </tr>
            `;
                    })
                    .join('');
            }

            const subtotal = items.reduce(
                (sum, i) => sum + Number(i.price || 0) * Number(i.quantity || 0),
                0
            );
            const handling = Number(data.handling || 0);
            const total = Number(data.total_price || subtotal + handling);

            els.subtotal.textContent = subtotal.toFixed(2);
            els.handling.textContent = handling.toFixed(2);
            els.total.textContent = total.toFixed(2);
        } catch (err) {
            console.error('Invoice load error:', err);
            els.itemsBody.innerHTML =
                `<tr><td colspan="4" style="text-align:center; padding:16px; color:#ef4444;">${err.message || 'Failed to load invoice'}</td></tr>`;
            if (window.NextsUI) window.NextsUI.showToast(err.message || 'Failed to load invoice', 'error');
        }
    }

    if (els.printBtn) {
        els.printBtn.addEventListener('click', () => {
            window.print();
        });
    }

    if (els.backBtn) {
        els.backBtn.addEventListener('click', () => {
            if (user && user.role === 'admin') {
                window.location.href = '/admin#orders-tab';
            } else {
                window.location.href = '/dashboard';
            }
        });
    }

    loadInvoice();
})();
