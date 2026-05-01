const express = require('express');
const PaymentSetting = require('../models/PaymentSetting');
const PaymentProof = require('../models/PaymentProof');
const Order = require('../models/Order');
const User = require('../models/User');
const { nextSequence } = require('../models/Counter');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { saveBase64Image } = require('../utils/imageStore');
const { cleanDoc } = require('../utils/format');
const { validatePaymentConfig, validateOrderProofReview } = require('../middleware/validators');

const router = express.Router();

router.get('/config', async (req, res) => {
    try {
        const config = await PaymentSetting.findOne({ is_active: 1 }).sort({ id: -1 });
        res.json(cleanDoc(config) || null);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching payment config', error: error.message });
    }
});

router.put('/config', authMiddleware, adminMiddleware, validatePaymentConfig, async (req, res) => {
    try {
        const { upi_id, qr_image_base64, qr_image_url } = req.body;

        let qrUrl = qr_image_url || null;
        if (qr_image_base64) {
            qrUrl = saveBase64Image(qr_image_base64, 'payment-qr');
        }

        await PaymentSetting.updateMany({ is_active: 1 }, { is_active: 0 });
        const setting = await PaymentSetting.create({
            id: await nextSequence('paymentSetting'),
            upi_id: upi_id.trim(),
            qr_image_url: qrUrl,
            is_active: 1,
            created_by: req.user.id,
            updated_by: req.user.id
        });

        res.json({ message: 'Payment configuration updated successfully', config: cleanDoc(setting) });
    } catch (error) {
        res.status(500).json({ message: 'Error updating payment config', error: error.message });
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
            order.payment_status = status;
            if (status === 'approved' && order.status === 'Pending') {
                order.status = 'Approved';
            }
            await order.save();
        }

        res.json({ message: `Order payment ${status} successfully` });
    } catch (error) {
        res.status(500).json({ message: 'Error reviewing order proof', error: error.message });
    }
});

module.exports = router;
