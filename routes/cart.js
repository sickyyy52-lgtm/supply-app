const express = require('express');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { authMiddleware } = require('../middleware/auth');
const { cleanDoc } = require('../utils/format');

const router = express.Router();

function normalizeItems(items) {
    if (!Array.isArray(items)) return null;

    const normalized = [];
    for (const item of items) {
        const productId = Number(item && item.product_id);
        const quantity = Number(item && item.quantity);

        if (!Number.isInteger(productId) || productId <= 0) return null;
        if (!Number.isInteger(quantity) || quantity <= 0) return null;

        normalized.push({ product_id: productId, quantity });
    }

    return normalized;
}

async function hydrateCart(cartDoc) {
    const cart = cleanDoc(cartDoc) || { user_id: null, items: [] };
    const productIds = cart.items.map((item) => item.product_id);
    const products = productIds.length ? await Product.find({ id: { $in: productIds } }) : [];
    const productMap = new Map(products.map((product) => [product.id, product]));

    cart.items = cart.items.map((item) => {
        const product = productMap.get(item.product_id);
        return {
            ...item,
            name: product ? product.name : '',
            category: product ? product.category : '',
            price: product ? Number(product.price) : 0,
            image: product ? product.image : '',
            stock: product ? Number(product.stock) : 0
        };
    });

    return cart;
}

router.get('/', authMiddleware, async (req, res) => {
    try {
        let cart = await Cart.findOne({ user_id: req.user.id });
        if (!cart) {
            cart = await Cart.create({ user_id: req.user.id, items: [] });
        }

        res.json(await hydrateCart(cart));
    } catch (error) {
        res.status(500).json({ message: 'Error fetching cart', error: error.message });
    }
});

router.put('/', authMiddleware, async (req, res) => {
    try {
        const items = normalizeItems(req.body && req.body.items);
        if (!items) {
            return res.status(400).json({ message: 'Valid cart items are required' });
        }

        const productIds = [...new Set(items.map((item) => item.product_id))];
        const existingProducts = await Product.countDocuments({ id: { $in: productIds } });
        if (existingProducts !== productIds.length) {
            return res.status(400).json({ message: 'Some cart products do not exist' });
        }

        const cart = await Cart.findOneAndUpdate(
            { user_id: req.user.id },
            { user_id: req.user.id, items },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        res.json({
            message: 'Cart updated successfully',
            cart: await hydrateCart(cart)
        });
    } catch (error) {
        res.status(500).json({ message: 'Error updating cart', error: error.message });
    }
});

router.delete('/', authMiddleware, async (req, res) => {
    try {
        await Cart.findOneAndUpdate(
            { user_id: req.user.id },
            { user_id: req.user.id, items: [] },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        res.json({ message: 'Cart cleared successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error clearing cart', error: error.message });
    }
});

module.exports = router;
