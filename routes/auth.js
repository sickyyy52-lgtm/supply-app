const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Notification = require('../models/Notification');
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

router.post('/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body || {};
        const normalizedEmail = String(email || '').trim().toLowerCase();

        if (!name || !normalizedEmail || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        if (isFixedAdminEmail(normalizedEmail)) {
            return res.status(403).json({ message: 'This email is reserved for admin access' });
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

        await Wallet.updateOne(
            { user_id: userId },
            { $setOnInsert: { user_id: userId, balance: 0 } },
            { upsert: true }
        );

        res.json({ message: 'Signup successful' });
    } catch (error) {
        if (error && error.code === 11000) {
            return res.status(400).json({ message: 'Email already exists' });
        }
        console.error('Signup error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        const normalizedEmail = String(email || '').trim().toLowerCase();
        const normalizedPassword = String(password || '');

        if (isFixedAdminEmail(normalizedEmail)) {
            if (normalizedPassword !== ADMIN_PASSWORD) {
                return res.status(400).json({ message: 'Invalid credentials' });
            }

            const token = jwt.sign(
                { id: FIXED_ADMIN_USER.id, email: FIXED_ADMIN_USER.email, role: FIXED_ADMIN_USER.role },
                process.env.JWT_SECRET,
                { expiresIn: '7d' }
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
            return res.status(403).json({ message: 'Your account has been blocked by admin' });
        }

        const isMatch = await bcrypt.compare(normalizedPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            message: 'Login successful',
            token,
            user: publicUser(user)
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

router.get('/me', authMiddleware, async (req, res) => {
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
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

router.put('/profile', authMiddleware, async (req, res) => {
    try {
        if (req.user.role === 'admin' && isFixedAdminEmail(req.user.email)) {
            return res.status(403).json({ message: 'Admin profile cannot be edited here' });
        }

        const { name, phone, address } = req.body || {};

        if (!name) {
            return res.status(400).json({ message: 'Name is required' });
        }

        const user = await User.findOneAndUpdate(
            { id: req.user.id },
            {
                name: String(name).trim(),
                phone: phone ? String(phone).trim() : '',
                address: address ? String(address).trim() : ''
            },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            message: 'Profile updated successfully',
            user: publicUser(user)
        });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

router.get('/users', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const users = await User.find({}, 'id name email role phone address is_blocked createdAt').sort({ id: -1 });
        res.json(cleanDocs(users));
    } catch (error) {
        console.error('Users fetch error:', error);
        res.status(500).json({ message: 'Error fetching users', error: error.message });
    }
});

router.put('/users/:id/role', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { role } = req.body || {};

        if (!role || !['user', 'admin'].includes(role)) {
            return res.status(400).json({ message: 'Valid role is required' });
        }

        const user = await User.findOneAndUpdate(
            { id: Number(req.params.id) },
            { role },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({ message: 'User role updated successfully' });
    } catch (error) {
        console.error('User role update error:', error);
        res.status(500).json({ message: 'Error updating user role', error: error.message });
    }
});

router.put('/users/:id/block', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { is_blocked } = req.body || {};
        const user = await User.findOneAndUpdate(
            { id: Number(req.params.id) },
            { is_blocked: is_blocked ? 1 : 0 },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({ message: 'User block status updated successfully' });
    } catch (error) {
        console.error('User block update error:', error);
        res.status(500).json({ message: 'Error updating block status', error: error.message });
    }
});

router.delete('/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const user = await User.findOneAndDelete({ id: Number(req.params.id) });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ message: 'Error deleting user', error: error.message });
    }
});

router.get('/notifications', authMiddleware, async (req, res) => {
    try {
        const notifications = await Notification.find({ user_id: req.user.id }).sort({ id: -1 });
        res.json(cleanDocs(notifications));
    } catch (error) {
        console.error('Notifications fetch error:', error);
        res.status(500).json({ message: 'Error fetching notifications', error: error.message });
    }
});

router.put('/notifications/:id/read', authMiddleware, async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { id: Number(req.params.id), user_id: req.user.id },
            { is_read: 1 },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        res.json({ message: 'Notification marked as read', notification: cleanDoc(notification) });
    } catch (error) {
        console.error('Notification read error:', error);
        res.status(500).json({ message: 'Error updating notification', error: error.message });
    }
});

module.exports = router;
