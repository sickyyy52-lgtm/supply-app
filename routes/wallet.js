const express = require('express');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const WalletTopup = require('../models/WalletTopup');
const PaymentProof = require('../models/PaymentProof');
const User = require('../models/User');
const { nextSequence } = require('../models/Counter');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { saveBase64Image } = require('../utils/imageStore');
const {
    validateWalletTopupCreate,
    validateWalletTopupReview,
    validateManualWalletCredit
} = require('../middleware/validators');
const { cleanDocs } = require('../utils/format');

const router = express.Router();

async function ensureWallet(userId) {
    return Wallet.findOneAndUpdate(
        { user_id: userId },
        { $setOnInsert: { user_id: userId, balance: 0 } },
        { upsert: true, new: true }
    );
}

function parsePositiveAmount(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return Number(amount.toFixed(2));
}

router.get('/me', authMiddleware, async (req, res) => {
    try {
        const wallet = await ensureWallet(req.user.id);
        const transactions = await WalletTransaction.find({ user_id: req.user.id }).sort({ id: -1 }).limit(20);
        const topups = await WalletTopup.find({ user_id: req.user.id }).sort({ id: -1 }).limit(20);

        res.json({
            balance: Number(wallet.balance || 0),
            transactions: cleanDocs(transactions),
            topups: cleanDocs(topups)
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching wallet', error: error.message });
    }
});

router.post('/topups', authMiddleware, validateWalletTopupCreate, async (req, res) => {
    try {
        const { requested_amount, image_base64 } = req.body;
        const amount = parsePositiveAmount(requested_amount);
        const imageUrl = saveBase64Image(image_base64, 'wallet-topups');

        const topup = await WalletTopup.create({
            id: await nextSequence('walletTopup'),
            user_id: req.user.id,
            requested_amount: amount,
            status: 'submitted'
        });

        const proof = await PaymentProof.create({
            id: await nextSequence('paymentProof'),
            user_id: req.user.id,
            type: 'wallet_topup',
            reference_id: topup.id,
            amount,
            image_url: imageUrl,
            status: 'submitted'
        });

        topup.proof_id = proof.id;
        await topup.save();

        res.json({ message: 'Top-up request submitted for admin approval', topupId: topup.id });
    } catch (error) {
        res.status(500).json({ message: 'Error requesting top-up', error: error.message });
    }
});

router.get('/topups/pending', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const topups = await WalletTopup.find({ status: 'submitted' }).sort({ id: -1 });
        const rows = [];

        for (const topup of topups) {
            const user = await User.findOne({ id: topup.user_id });
            const proof = topup.proof_id ? await PaymentProof.findOne({ id: topup.proof_id }) : null;

            rows.push({
                id: topup.id,
                user_id: topup.user_id,
                requested_amount: topup.requested_amount,
                status: topup.status,
                created_at: topup.createdAt,
                admin_notes: topup.admin_notes,
                user_name: user ? user.name : '',
                user_email: user ? user.email : '',
                image_url: proof ? proof.image_url : '',
                proof_id: proof ? proof.id : null
            });
        }

        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching top-up requests', error: error.message });
    }
});

router.put('/topups/:id/review', authMiddleware, adminMiddleware, validateWalletTopupReview, async (req, res) => {
    try {
        const { status, notes, credit_amount } = req.body;
        const topup = await WalletTopup.findOne({ id: Number(req.params.id) });

        if (!topup) {
            return res.status(404).json({ message: 'Top-up request not found' });
        }

        if (topup.status !== 'submitted') {
            return res.status(400).json({ message: 'Top-up already reviewed' });
        }

        if (status === 'approved') {
            const amount = parsePositiveAmount(credit_amount || topup.requested_amount);
            if (!amount) {
                return res.status(400).json({ message: 'Valid credit amount is required' });
            }

            await ensureWallet(topup.user_id);
            await Wallet.updateOne({ user_id: topup.user_id }, { $inc: { balance: amount } });

            await WalletTransaction.create({
                id: await nextSequence('walletTransaction'),
                user_id: topup.user_id,
                type: 'credit',
                amount,
                reason: 'Top-up approved by admin',
                reference_type: 'wallet_topup',
                reference_id: topup.id,
                created_by: req.user.id
            });
        }

        topup.status = status;
        topup.approved_by = req.user.id;
        topup.approved_at = new Date();
        topup.admin_notes = notes || null;
        await topup.save();

        if (topup.proof_id) {
            await PaymentProof.updateOne(
                { id: topup.proof_id },
                {
                    status,
                    admin_notes: notes || null,
                    reviewed_by: req.user.id,
                    reviewed_at: new Date()
                }
            );
        }

        res.json({ message: `Top-up ${status} successfully` });
    } catch (error) {
        res.status(500).json({ message: 'Error reviewing top-up', error: error.message });
    }
});

router.post('/admin/credit', authMiddleware, adminMiddleware, validateManualWalletCredit, async (req, res) => {
    try {
        const { user_id, amount, reason } = req.body;
        const creditAmount = parsePositiveAmount(amount);
        const userId = Number(user_id);

        const user = await User.findOne({ id: userId });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        await ensureWallet(userId);
        await Wallet.updateOne({ user_id: userId }, { $inc: { balance: creditAmount } });

        await WalletTransaction.create({
            id: await nextSequence('walletTransaction'),
            user_id: userId,
            type: 'credit',
            amount: creditAmount,
            reason: reason || 'Manual credit by admin',
            reference_type: 'manual',
            reference_id: null,
            created_by: req.user.id
        });

        res.json({ message: 'Wallet credited successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error crediting wallet', error: error.message });
    }
});

module.exports = router;
