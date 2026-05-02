const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Notification = require('../models/Notification');
const PasswordResetRequest = require('../models/PasswordResetRequest'); // NEW
const { nextSequence } = require('../models/Counter');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { cleanDoc, cleanDocs } = require('../utils/format');

const router = express.Router();

const ADMIN_EMAIL = 'shreyashmohite61@gmail.com';
const ADMIN_PASSWORD = 'Shrey@Admin#91X';

const FIXED_ADMIN_USER = {
    id: 0,
    name: 'Admin',
    email: ADMIN_EMAIL,
    role: 'admin',
    phone: '',
    address: '',
    is_blocked: 0
};

function isFixedAdminEmail(email) {
    return String(email || '').trim().toLowerCase() === ADMIN_EMAIL;
}

function publicUser(user) {
    if (!user) return null;
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone || '',
        address: user.address || '',
        is_blocked: user.is_blocked || 0
    };
}

// ========== SIGNUP ==========
router.post('/signup', async(req, res) => {
    try {
        const { name, email, password } = req.body || {};
        const normalizedEmail = String(email || '').trim().toLowerCase();

        if (!name || !normalizedEmail || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        if (isFixedAdminEmail(normalizedEmail)) {
            return res
                .status(403)
                .json({ message: 'This email is reserved for admin access' });
        }

        const existing = await User.findOne({ email: normalizedEmail });
        if (existing) {
            return res.status(400).json({ message: 'Email already exists' });
        }

        const hashedPassword = await bcrypt.hash(String(password), 10);
        const userId = await nextSequence('user');

        await User.create({
            id: userId,
            name: String(name).trim(),
            email: normalizedEmail,
            password: hashedPassword
        });

        await Wallet.updateOne({ user_id: userId }, { $setOnInsert: { user_id: userId, balance: 0 } }, { upsert: true });

        res.json({ message: 'Signup successful' });
    } catch (error) {
        if (error && error.code === 11000) {
            return res.status(400).json({ message: 'Email already exists' });
        }
        console.error('Signup error:', error);
        res
            .status(500)
            .json({ message: 'Server error', error: error.message });
    }
});

// ========== LOGIN ==========
router.post('/login', async(req, res) => {
    try {
        const { email, password } = req.body || {};
        const normalizedEmail = String(email || '').trim().toLowerCase();
        const normalizedPassword = String(password || '');

        // fixed admin shortcut
        if (isFixedAdminEmail(normalizedEmail)) {
            if (normalizedPassword !== ADMIN_PASSWORD) {
                return res.status(400).json({ message: 'Invalid credentials' });
            }

            const token = jwt.sign({
                    id: FIXED_ADMIN_USER.id,
                    email: FIXED_ADMIN_USER.email,
                    role: FIXED_ADMIN_USER.role
                },
                process.env.JWT_SECRET, { expiresIn: '7d' }
            );

            return res.json({
                message: 'Login successful',
                token,
                user: FIXED_ADMIN_USER
            });
        }

        const user = await User.findOne({ email: normalizedEmail });

        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        if (user.is_blocked) {
            return res
                .status(403)
                .json({ message: 'Your account has been blocked by admin' });
        }

        const isMatch = await bcrypt.compare(normalizedPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET, { expiresIn: '7d' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: publicUser(user)
        });
    } catch (error) {
        console.error('Login error:', error);
        res
            .status(500)
            .json({ message: 'Server error', error: error.message });
    }
});

// ========== USER: ME ==========
router.get('/me', authMiddleware, async(req, res) => {
    try {
        if (req.user.role === 'admin' && isFixedAdminEmail(req.user.email)) {
            return res.json(FIXED_ADMIN_USER);
        }

        const user = await User.findOne({ id: req.user.id });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json(publicUser(user));
    } catch (error) {
        console.error('Profile fetch error:', error);
        res
            .status(500)
            .json({ message: 'Server error', error: error.message });
    }
});

// ========== USER: UPDATE PROFILE ==========
router.put('/profile', authMiddleware, async(req, res) => {
    try {
        if (req.user.role === 'admin' && isFixedAdminEmail(req.user.email)) {
            return res
                .status(403)
                .json({ message: 'Admin profile cannot be edited here' });
        }

        const { name, phone, address } = req.body || {};

        if (!name) {
            return res.status(400).json({ message: 'Name is required' });
        }

        const user = await User.findOneAndUpdate({ id: req.user.id }, {
            name: String(name).trim(),
            phone: phone ? String(phone).trim() : '',
            address: address ? String(address).trim() : ''
        }, { new: true });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            message: 'Profile updated successfully',
            user: publicUser(user)
        });
    } catch (error) {
        console.error('Profile update error:', error);
        res
            .status(500)
            .json({ message: 'Server error', error: error.message });
    }
});

// ========== USER: PASSWORD RESET REQUEST (FORGOT) ==========
router.post('/password-reset-requests', async(req, res) => {
    try {
        const { identifier, note } = req.body || {};
        if (!identifier || !String(identifier).trim()) {
            return res
                .status(400)
                .json({ message: 'Email or phone is required' });
        }

        const idValue = String(identifier).trim().toLowerCase();

        const user = await User.findOne({
            $or: [
                { email: idValue },
                { phone: idValue },
                { phone: new RegExp(idValue.replace(/[^0-9]/g, ''), 'i') }
            ]
        });

        // Security: user exist hai ya nahi, generic response
        if (!user) {
            return res.json({
                message: 'If this account exists, the admin will contact you for password reset.'
            });
        }

        // existing pending request?
        const existingPending = await PasswordResetRequest.findOne({
            user_id: user.id,
            status: 'pending'
        });
        if (existingPending) {
            return res.json({
                message: 'A password reset request is already pending. Admin will contact you soon.'
            });
        }

        const reqDoc = await PasswordResetRequest.create({
            id: await nextSequence('passwordReset'),
            user_id: user.id,
            email: user.email,
            phone: user.phone || '',
            note: note || '',
            status: 'pending'
        });

        res.json({
            message: 'Request submitted. Admin will contact you with new access details.',
            requestId: reqDoc.id
        });
    } catch (err) {
        console.error('Password reset request error:', err);
        res
            .status(500)
            .json({ message: 'Error submitting request' });
    }
});

// ========== ADMIN: LIST RESET REQUESTS ==========
router.get(
    '/password-reset-requests',
    authMiddleware,
    adminMiddleware,
    async(req, res) => {
        try {
            const requests = await PasswordResetRequest.find({}).sort({
                createdAt: -1
            });
            res.json(cleanDocs(requests));
        } catch (err) {
            console.error('Fetch reset requests error:', err);
            res.status(500).json({
                message: 'Error fetching reset requests',
                error: err.message
            });
        }
    }
);

// ========== ADMIN: APPROVE RESET REQUEST ==========
router.put(
    '/password-reset-requests/:id/approve',
    authMiddleware,
    adminMiddleware,
    async(req, res) => {
        try {
            const requestId = Number(req.params.id);
            const { temp_password, admin_note } = req.body || {};

            const pr = await PasswordResetRequest.findOne({ id: requestId });
            if (!pr) return res.status(404).json({ message: 'Request not found' });

            if (pr.status !== 'pending') {
                return res
                    .status(400)
                    .json({ message: 'Request already processed' });
            }

            const user = await User.findOne({ id: pr.user_id });
            if (!user) return res.status(404).json({ message: 'User not found' });

            const newPassword =
                temp_password && String(temp_password).trim().length >= 6 ?
                String(temp_password).trim() :
                Math.random().toString(36).slice(-8); // random 8 chars

            user.password = await bcrypt.hash(newPassword, 10);
            await user.save();

            pr.status = 'approved';
            pr.admin_note = admin_note || '';
            pr.temp_password_set = true;
            await pr.save();

            res.json({
                message: 'Password reset approved',
                user_id: user.id,
                temp_password: newPassword
            });
        } catch (err) {
            console.error('Approve reset request error:', err);
            res
                .status(500)
                .json({ message: 'Error approving password reset' });
        }
    }
);

// ========== ADMIN: REJECT RESET REQUEST ==========
router.put(
    '/password-reset-requests/:id/reject',
    authMiddleware,
    adminMiddleware,
    async(req, res) => {
        try {
            const requestId = Number(req.params.id);
            const { admin_note } = req.body || {};

            const pr = await PasswordResetRequest.findOneAndUpdate({ id: requestId }, { status: 'rejected', admin_note: admin_note || '' }, { new: true });

            if (!pr) return res.status(404).json({ message: 'Request not found' });

            res.json({ message: 'Password reset request rejected' });
        } catch (err) {
            console.error('Reject reset request error:', err);
            res
                .status(500)
                .json({ message: 'Error rejecting password reset' });
        }
    }
);

// ========== ADMIN: USERS LIST / ROLE / BLOCK / DELETE ==========
router.get('/users', authMiddleware, adminMiddleware, async(req, res) => {
    try {
        const users = await User.find({},
            'id name email role phone address is_blocked createdAt'
        ).sort({ id: -1 });
        res.json(cleanDocs(users));
    } catch (error) {
        console.error('Users fetch error:', error);
        res
            .status(500)
            .json({ message: 'Error fetching users', error: error.message });
    }
});

router.put('/users/:id/role', authMiddleware, adminMiddleware, async(req, res) => {
    try {
        const { role } = req.body || {};

        if (!role || !['user', 'admin'].includes(role)) {
            return res.status(400).json({ message: 'Valid role is required' });
        }

        const user = await User.findOneAndUpdate({ id: Number(req.params.id) }, { role }, { new: true });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({ message: 'User role updated successfully' });
    } catch (error) {
        console.error('User role update error:', error);
        res
            .status(500)
            .json({ message: 'Error updating user role', error: error.message });
    }
});

router.put(
    '/users/:id/block',
    authMiddleware,
    adminMiddleware,
    async(req, res) => {
        try {
            const { is_blocked } = req.body || {};
            const user = await User.findOneAndUpdate({ id: Number(req.params.id) }, { is_blocked: is_blocked ? 1 : 0 }, { new: true });

            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            res.json({ message: 'User block status updated successfully' });
        } catch (error) {
            console.error('User block update error:', error);
            res
                .status(500)
                .json({ message: 'Error updating block status', error: error.message });
        }
    }
);

router.delete(
    '/users/:id',
    authMiddleware,
    adminMiddleware,
    async(req, res) => {
        try {
            const user = await User.findOneAndDelete({
                id: Number(req.params.id)
            });

            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            res.json({ message: 'User deleted successfully' });
        } catch (error) {
            console.error('Delete user error:', error);
            res
                .status(500)
                .json({ message: 'Error deleting user', error: error.message });
        }
    }
);

// ========== NOTIFICATIONS ==========
router.get('/notifications', authMiddleware, async(req, res) => {
    try {
        const notifications = await Notification.find({
            user_id: req.user.id
        }).sort({ id: -1 });
        res.json(cleanDocs(notifications));
    } catch (error) {
        console.error('Notifications fetch error:', error);
        res
            .status(500)
            .json({
                message: 'Error fetching notifications',
                error: error.message
            });
    }
});

router.put('/notifications/:id/read', authMiddleware, async(req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate({ id: Number(req.params.id), user_id: req.user.id }, { is_read: 1 }, { new: true });

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        res.json({
            message: 'Notification marked as read',
            notification: cleanDoc(notification)
        });
    } catch (error) {
        console.error('Notification read error:', error);
        res
            .status(500)
            .json({
                message: 'Error updating notification',
                error: error.message
            });
    }
});

module.exports = router;