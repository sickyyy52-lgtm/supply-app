const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const PasswordResetRequest = require('../models/PasswordResetRequest');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const router = express.Router();
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function generatePassword(length = 8) {
    const bytes = crypto.randomBytes(length);
    return Array.from(bytes, (byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]).join('');
}

function normalizeCustomPassword(body) {
    const rawPassword = body.password || body.customPassword || body.newPassword || '';
    const password = String(rawPassword).trim();
    return password || null;
}

router.use(authMiddleware, adminMiddleware);

router.get('/password-reset-requests', async(req, res) => {
    try {
        const requests = await PasswordResetRequest.find({})
            .populate('userId', 'name email phone')
            .sort({ createdAt: -1 })
            .lean();

        res.json(requests);
    } catch (error) {
        console.error('Fetch password reset requests error:', error);
        res.status(500).json({
            message: 'Error fetching password reset requests',
            error: error.message
        });
    }
});

router.post('/password-reset-requests/:id/approve', async(req, res) => {
    try {
        const request = await PasswordResetRequest.findById(req.params.id);
        if (!request) {
            return res.status(404).json({ message: 'Password reset request not found' });
        }

        if (request.status !== 'pending') {
            return res.status(400).json({ message: 'Password reset request has already been processed' });
        }

        const user = await User.findById(request.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found for this reset request' });
        }

        const customPassword = normalizeCustomPassword(req.body || {});
        if (customPassword && customPassword.length < 8) {
            return res.status(400).json({ message: 'Custom password must be at least 8 characters' });
        }

        const plainPassword = customPassword || generatePassword(8);
        user.password = await bcrypt.hash(plainPassword, 12);
        await user.save();

        request.status = 'approved';
        request.adminNote = req.body?.note ? String(req.body.note).trim() : '';
        await request.save();

        res.json({
            message: 'Password reset approved',
            password: plainPassword
        });
    } catch (error) {
        console.error('Approve password reset request error:', error);
        res.status(500).json({
            message: 'Error approving password reset request',
            error: error.message
        });
    }
});

router.post('/password-reset-requests/:id/reject', async(req, res) => {
    try {
        const request = await PasswordResetRequest.findById(req.params.id);
        if (!request) {
            return res.status(404).json({ message: 'Password reset request not found' });
        }

        if (request.status !== 'pending') {
            return res.status(400).json({ message: 'Password reset request has already been processed' });
        }

        request.status = 'rejected';
        request.adminNote = req.body?.note ? String(req.body.note).trim() : '';
        await request.save();

        res.json({ message: 'Password reset request rejected' });
    } catch (error) {
        console.error('Reject password reset request error:', error);
        res.status(500).json({
            message: 'Error rejecting password reset request',
            error: error.message
        });
    }
});

module.exports = router;
