const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_EMAIL = 'shreyashmohite61@gmail.com';

function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Invalid token' });
    }
}

function adminMiddleware(req, res, next) {
    const normalizedEmail = String(req.user?.email || '').trim().toLowerCase();

    if (!req.user || req.user.role !== 'admin' || normalizedEmail !== ADMIN_EMAIL) {
        return res.status(403).json({ message: 'Admin access only' });
    }
    next();
}

module.exports = {
    authMiddleware,
    adminMiddleware
};
