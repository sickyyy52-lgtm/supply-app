const token = localStorage.getItem('token');
const user = JSON.parse(localStorage.getItem('user') || 'null');

const NEXTS_UPI_ID = '9579544462@ptyes';
const NEXTS_PAYEE_NAME = 'Nexts';
const PAYMENT_PROOF_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const PAYMENT_PROOF_MAX_SIZE = 2 * 1024 * 1024;

const orderTitle = document.getElementById('upi-order-title');
const amountText = document.getElementById('upi-amount');
const amountPill = document.getElementById('upi-amount-pill');
const upiIdText = document.getElementById('upi-id');
const noteText = document.getElementById('upi-note');
const statusChip = document.getElementById('upi-payment-status');
const upiQr = document.getElementById('upi-qr');
const proofForm = document.getElementById('upi-proof-form');
const proofFileInput = document.getElementById('upi-proof-file');
const utrInput = document.getElementById('upi-utr');
const proofSubmitBtn = document.getElementById('upi-proof-submit');
const upiAppButtons = document.querySelectorAll('.upi-app-btn');

let currentOrder = null;
let currentUpiUrl = '';

if (!token || !user) {
    window.location.href = '/login';
}

function showToast(message, type = 'info') {
    if (window.NextsUI) {
        window.NextsUI.showToast(message, type);
    }
}

function getOrderIdFromPath() {
    const parts = window.location.pathname.split('/').filter(Boolean);
    const orderId = Number(parts[parts.length - 1]);
    return Number.isInteger(orderId) && orderId > 0 ? orderId : null;
}

async function parseResponse(res) {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) return res.json();
    const text = await res.text();
    throw new Error(text || 'Unexpected server response');
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

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read payment screenshot'));
        reader.readAsDataURL(file);
    });
}

function renderOrder(order) {
    const amount = Number(order.total_price || 0);
    currentOrder = order;
    currentUpiUrl = buildUpiPaymentString(amount, order.id);

    orderTitle.textContent = `#${order.id}`;
    amountText.textContent = amount.toFixed(2);
    amountPill.textContent = amount.toFixed(2);
    upiIdText.textContent = NEXTS_UPI_ID;
    noteText.textContent = String(order.id);
    statusChip.textContent = order.payment_status || 'PENDING_VERIFICATION';
    upiQr.src = createQrSvgDataUrl(currentUpiUrl);

    if (order.payment_status === 'PAID') {
        proofSubmitBtn.disabled = true;
        proofSubmitBtn.textContent = 'Payment Already Approved';
    }
}

async function loadOrder() {
    const orderId = getOrderIdFromPath();
    if (!orderId) {
        showToast('Invalid UPI payment link', 'error');
        return;
    }

    const res = await fetch(`/api/orders/${orderId}`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    const data = await parseResponse(res);

    if (!res.ok) {
        throw new Error(data.message || 'Failed to load order');
    }

    if (data.payment_method !== 'UPI') {
        showToast('This order does not require UPI payment', 'info');
        setTimeout(() => {
            window.location.href = `/invoice.html?orderId=${data.id}`;
        }, 700);
        return;
    }

    renderOrder(data);
}

upiAppButtons.forEach((button) => {
    button.addEventListener('click', () => {
        if (!currentUpiUrl) return;
        showToast(`Opening ${button.dataset.app || 'UPI app'}`, 'info');
        window.location.href = currentUpiUrl;
    });
});

if (proofForm) {
    proofForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (!currentOrder) {
            showToast('Order is still loading', 'error');
            return;
        }

        const file = proofFileInput.files && proofFileInput.files[0];
        if (!file) {
            showToast('Payment screenshot is required', 'error');
            return;
        }

        if (!PAYMENT_PROOF_TYPES.has(file.type)) {
            showToast('Screenshot must be JPEG, PNG, or WEBP', 'error');
            return;
        }

        if (file.size > PAYMENT_PROOF_MAX_SIZE) {
            showToast('Screenshot must be 2MB or smaller', 'error');
            return;
        }

        proofSubmitBtn.disabled = true;
        proofSubmitBtn.textContent = 'Uploading Proof...';

        try {
            const paymentProofBase64 = await fileToBase64(file);
            const res = await fetch(`/api/payments/orders/${currentOrder.id}/proof`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    payment_proof_base64: paymentProofBase64,
                    payment_utr: utrInput.value.trim()
                })
            });
            const data = await parseResponse(res);

            if (!res.ok) {
                throw new Error(data.message || 'Failed to upload payment proof');
            }

            showToast(data.message || 'Payment proof uploaded', 'success');
            setTimeout(() => {
                window.location.href = `/invoice.html?orderId=${currentOrder.id}`;
            }, 900);
        } catch (error) {
            showToast(error.message || 'Failed to upload payment proof', 'error');
            proofSubmitBtn.disabled = false;
            proofSubmitBtn.textContent = 'Submit Proof for Verification';
        }
    });
}

loadOrder().catch((error) => {
    showToast(error.message || 'Failed to load UPI payment page', 'error');
});
