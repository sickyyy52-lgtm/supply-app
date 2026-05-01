function badRequest(res, message) {
    return res.status(400).json({ message });
}

function isNonEmptyString(value, min = 1, max = 500) {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    return trimmed.length >= min && trimmed.length <= max;
}

function toPositiveNumber(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return null;
    return Number(num.toFixed(2));
}

function validatePaymentConfig(req, res, next) {
    const { upi_id, qr_image_base64, qr_image_url } = req.body || {};

    if (!isNonEmptyString(upi_id, 3, 255)) {
        return badRequest(res, 'Valid UPI ID is required');
    }

    if (qr_image_base64 && typeof qr_image_base64 !== 'string') {
        return badRequest(res, 'Invalid QR image payload');
    }

    if (qr_image_url && typeof qr_image_url !== 'string') {
        return badRequest(res, 'Invalid QR image URL');
    }

    req.body.upi_id = upi_id.trim();
    next();
}

function validateOrderCreate(req, res, next) {
    const {
        items,
        address,
        phone,
        customer_name,
        payment_method,
        payment_proof_base64
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
        return badRequest(res, 'Order items are required');
    }

    if (!isNonEmptyString(address, 5, 500)) return badRequest(res, 'Valid address is required');
    if (!isNonEmptyString(phone, 6, 30)) return badRequest(res, 'Valid phone is required');
    if (!isNonEmptyString(customer_name, 2, 120)) return badRequest(res, 'Valid customer name is required');

    const method = String(payment_method || 'Cash on Delivery');
    const allowedMethods = ['Cash on Delivery', 'UPI', 'Wallet'];
    if (!allowedMethods.includes(method)) return badRequest(res, 'Invalid payment method');

    if (method === 'UPI') {
        if (!payment_proof_base64 || typeof payment_proof_base64 !== 'string') {
            return badRequest(res, 'Payment screenshot is required for UPI orders');
        }
    }

    req.body.payment_method = method;
    req.body.address = address.trim();
    req.body.phone = phone.trim();
    req.body.customer_name = customer_name.trim();
    next();
}

function validateOrderStatusUpdate(req, res, next) {
    const { status } = req.body || {};
    const allowedStatuses = ['Pending', 'Approved', 'Packed', 'Shipped', 'Delivered', 'Cancelled', 'Rejected'];
    if (!allowedStatuses.includes(status)) {
        return badRequest(res, 'Invalid order status');
    }
    next();
}

function validateOrderProofReview(req, res, next) {
    const { status, notes } = req.body || {};
    if (!['approved', 'rejected'].includes(status)) {
        return badRequest(res, 'Invalid review status');
    }
    if (notes !== undefined && typeof notes !== 'string') {
        return badRequest(res, 'Invalid notes');
    }
    next();
}

function validateWalletTopupCreate(req, res, next) {
    const { requested_amount, image_base64 } = req.body || {};
    const amount = toPositiveNumber(requested_amount);

    if (!amount) return badRequest(res, 'Valid top-up amount is required');
    if (!image_base64 || typeof image_base64 !== 'string') {
        return badRequest(res, 'Payment screenshot is required');
    }

    req.body.requested_amount = amount;
    next();
}

function validateWalletTopupReview(req, res, next) {
    const { status, notes, credit_amount } = req.body || {};
    if (!['approved', 'rejected'].includes(status)) {
        return badRequest(res, 'Invalid review status');
    }
    if (notes !== undefined && typeof notes !== 'string') {
        return badRequest(res, 'Invalid notes');
    }
    if (credit_amount !== undefined && toPositiveNumber(credit_amount) === null) {
        return badRequest(res, 'Invalid credit amount');
    }
    next();
}

function validateManualWalletCredit(req, res, next) {
    const { user_id, amount, reason } = req.body || {};
    const userId = Number(user_id);
    const creditAmount = toPositiveNumber(amount);

    if (!Number.isInteger(userId) || userId <= 0) {
        return badRequest(res, 'Valid user ID is required');
    }
    if (!creditAmount) {
        return badRequest(res, 'Valid credit amount is required');
    }
    if (reason !== undefined && typeof reason !== 'string') {
        return badRequest(res, 'Invalid reason');
    }

    req.body.user_id = userId;
    req.body.amount = creditAmount;
    next();
}

module.exports = {
    validatePaymentConfig,
    validateOrderCreate,
    validateOrderStatusUpdate,
    validateOrderProofReview,
    validateWalletTopupCreate,
    validateWalletTopupReview,
    validateManualWalletCredit
};
