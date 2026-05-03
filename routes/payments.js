const express = require('express');
const fs = require('fs');
const path = require('path');
const PaymentSetting = require('../models/PaymentSetting');
const PaymentProof = require('../models/PaymentProof');
const Order = require('../models/Order');
const User = require('../models/User');
const { nextSequence } = require('../models/Counter');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { uploadBase64Image } = require('../utils/cloudinary');
const { cleanDoc } = require('../utils/format');
const { validatePaymentConfig, validateOrderProofReview } = require('../middleware/validators');

const router = express.Router();

function normalizeStoredUrl(imageUrl) {
    if (!imageUrl || typeof imageUrl !== 'string') return null;
    const trimmed = imageUrl.trim();
    return trimmed || null;
}

function isRemoteUrl(imageUrl) {
    return /^https?:\/\//i.test(imageUrl);
}

function localUploadExists(imageUrl) {
    if (!imageUrl.startsWith('/uploads/')) return false;

    const publicDir = path.join(__dirname, '..', 'public');
    const relativePath = imageUrl.replace(/^\/+/, '').split('/').join(path.sep);
    const fullPath = path.join(publicDir, relativePath);

    if (!fullPath.startsWith(publicDir)) return false;
    return fs.existsSync(fullPath);
}

function isUsableQrUrl(imageUrl) {
    const normalizedUrl = normalizeStoredUrl(imageUrl);
    if (!normalizedUrl) return false;
    if (isRemoteUrl(normalizedUrl)) return true;
    return localUploadExists(normalizedUrl);
}

async function findLastUsableQrUrl(currentConfig = null) {
    const configs = [];
    if (currentConfig) configs.push(currentConfig);

    const recentConfigs = await PaymentSetting.find({}).sort({ id: -1 }).limit(25);
    configs.push(...recentConfigs);

    for (const config of configs) {
        const qrUrl = normalizeStoredUrl(config.qr_image_url);
        if (qrUrl && isUsableQrUrl(qrUrl)) return qrUrl;

        const lastValidQrUrl = normalizeStoredUrl(config.last_valid_qr_image_url);
        if (lastValidQrUrl && isUsableQrUrl(lastValidQrUrl)) return lastValidQrUrl;
    }

    return null;
}

function buildPaymentConfigResponse(config, qrUrl) {
    const cleanedConfig = cleanDoc(config);
    if (!cleanedConfig) return null;

    cleanedConfig.qr_image_url = qrUrl || null;
    cleanedConfig.last_valid_qr_image_url = qrUrl || normalizeStoredUrl(cleanedConfig.last_valid_qr_image_url);
    return cleanedConfig;
}

router.get('/config', async (req, res) => {
    try {
        const config = await PaymentSetting.findOne({ is_active: 1 }).sort({ id: -1 });
        if (!config) return res.json(null);

        const qrUrl = await findLastUsableQrUrl(config);
        res.json(buildPaymentConfigResponse(config, qrUrl));
    } catch (error) {
        res.status(500).json({ message: 'Error fetching payment config', error: error.message });
    }
});

router.put('/config', authMiddleware, adminMiddleware, validatePaymentConfig, async (req, res) => {
    try {
        const { upi_id, qr_image_base64, qr_image_url } = req.body;
        const previousConfig = await PaymentSetting.findOne({ is_active: 1 }).sort({ id: -1 });

        let qrUrl = await findLastUsableQrUrl(previousConfig);
        if (qr_image_base64) {
            qrUrl = await uploadBase64Image(qr_image_base64, 'payment-qr');
        } else if (normalizeStoredUrl(qr_image_url)) {
            qrUrl = normalizeStoredUrl(qr_image_url);
        }

        await PaymentSetting.updateMany({ is_active: 1 }, { is_active: 0 });
        const setting = await PaymentSetting.create({
            id: await nextSequence('paymentSetting'),
            upi_id: upi_id.trim(),
            qr_image_url: qrUrl,
            last_valid_qr_image_url: qrUrl,
            is_active: 1,
            created_by: req.user.id,
            updated_by: req.user.id
        });

        res.json({
            message: 'Payment configuration updated successfully',
            config: buildPaymentConfigResponse(setting, qrUrl)
        });
    } catch (error) {
        const uploadError = /image|unsupported|format|too large/i.test(error.message || '');
        res.status(uploadError ? 400 : 500).json({ message: 'Error updating payment config', error: error.message });
    }
});

router.post('/orders/:orderId/proof', authMiddleware, async (req, res) => {
    try {
        const orderId = Number(req.params.orderId);
        const { payment_proof_base64, payment_utr } = req.body || {};

        if (!Number.isInteger(orderId) || orderId <= 0) {
            return res.status(400).json({ message: 'Invalid order ID' });
        }

        if (!payment_proof_base64 || typeof payment_proof_base64 !== 'string') {
            return res.status(400).json({ message: 'Payment screenshot is required' });
        }

        if (payment_utr !== undefined && typeof payment_utr !== 'string') {
            return res.status(400).json({ message: 'Invalid UTR or transaction ID' });
        }

        const order = await Order.findOne({ id: orderId });
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        if (req.user.role !== 'admin' && order.user_id !== req.user.id) {
            return res.status(403).json({ message: 'Not allowed to submit proof for this order' });
        }

        if (order.payment_method !== 'UPI') {
            return res.status(400).json({ message: 'Payment proof is only allowed for UPI orders' });
        }

        if (order.payment_status === 'PAID') {
            return res.status(400).json({ message: 'This order is already paid' });
        }

        const imageUrl = await uploadBase64Image(payment_proof_base64, 'order-payments');
        const transactionId = payment_utr ? payment_utr.trim().slice(0, 120) : null;

        let proof = await PaymentProof.findOne({
            type: 'order',
            reference_id: order.id,
            status: { $ne: 'approved' }
        }).sort({ id: -1 });

        if (proof) {
            proof.image_url = imageUrl;
            proof.transaction_id = transactionId;
            proof.status = 'submitted';
            proof.admin_notes = null;
            proof.reviewed_by = null;
            proof.reviewed_at = null;
            await proof.save();
        } else {
            proof = await PaymentProof.create({
                id: await nextSequence('paymentProof'),
                user_id: req.user.id,
                type: 'order',
                reference_id: order.id,
                amount: Number(order.total_price || 0),
                image_url: imageUrl,
                transaction_id: transactionId,
                status: 'submitted'
            });
        }

        order.payment_proof_id = proof.id;
        order.payment_status = 'WAITING_ADMIN_APPROVAL';
        order.status = 'Pending';
        await order.save();

        res.json({
            message: 'Payment proof uploaded. Waiting for admin approval.',
            orderId: order.id,
            proofId: proof.id,
            payment_status: order.payment_status,
            status: order.status
        });
    } catch (error) {
        const uploadError = /image|unsupported|format|too large/i.test(error.message || '');
        res.status(uploadError ? 400 : 500).json({
            message: 'Error uploading payment proof',
            error: error.message
        });
    }
});

router.get('/order-proofs/pending', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const proofs = await PaymentProof.find({ type: 'order', status: 'submitted' }).sort({ id: -1 });
        const rows = [];

        for (const proof of proofs) {
            const order = await Order.findOne({ id: proof.reference_id });
            const user = await User.findOne({ id: proof.user_id });

            rows.push({
                proof_id: proof.id,
                image_url: proof.image_url,
                transaction_id: proof.transaction_id || '',
                amount: proof.amount,
                created_at: proof.createdAt,
                order_id: order ? order.id : proof.reference_id,
                order_status: order ? order.status : '',
                payment_status: order ? order.payment_status : proof.status,
                user_id: user ? user.id : proof.user_id,
                user_name: user ? user.name : '',
                user_email: user ? user.email : ''
            });
        }

        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching pending order proofs', error: error.message });
    }
});

router.put('/order-proofs/:id/review', authMiddleware, adminMiddleware, validateOrderProofReview, async (req, res) => {
    try {
        const proofId = Number(req.params.id);
        const { status, notes } = req.body;
        const proof = await PaymentProof.findOne({ id: proofId });

        if (!proof) {
            return res.status(404).json({ message: 'Payment proof not found' });
        }

        if (proof.type !== 'order') {
            return res.status(400).json({ message: 'This proof is not linked to an order' });
        }

        if (proof.status !== 'submitted') {
            return res.status(400).json({ message: 'Payment proof already reviewed' });
        }

        proof.status = status;
        proof.admin_notes = notes || null;
        proof.reviewed_by = req.user.id;
        proof.reviewed_at = new Date();
        await proof.save();

        const order = await Order.findOne({ id: proof.reference_id });
        if (order) {
            if (status === 'approved') {
                order.payment_status = 'PAID';
                order.status = 'Processing';
            } else {
                order.payment_status = 'REJECTED';
                order.status = 'Rejected';
            }
            await order.save();
        }

        res.json({ message: `Order payment ${status} successfully` });
    } catch (error) {
        res.status(500).json({ message: 'Error reviewing order proof', error: error.message });
    }
});

module.exports = router;
