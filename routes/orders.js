const express = require('express');
const Product = require('../models/Product');
const User = require('../models/User');
const Order = require('../models/Order');
const PaymentProof = require('../models/PaymentProof');
const Notification = require('../models/Notification');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const { nextSequence } = require('../models/Counter');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { saveBase64Image } = require('../utils/imageStore');
const { cleanDocs, cleanDoc } = require('../utils/format');
const {
    validateOrderCreate,
    validateOrderStatusUpdate
} = require('../middleware/validators');

const router = express.Router();

function parseAmount(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    return Number(amount.toFixed(2));
}

function parseQuantity(value) {
    const qty = Number(value);
    if (!Number.isInteger(qty) || qty <= 0) return null;
    return qty;
}

async function ensureWallet(userId) {
    return Wallet.findOneAndUpdate({ user_id: userId }, { $setOnInsert: { user_id: userId, balance: 0 } }, { upsert: true, new: true });
}

/**
 * CREATE ORDER
 */
router.post('/', authMiddleware, validateOrderCreate, async(req, res) => {
    const stockRollbacks = [];
    let createdOrderId = null;
    let createdProofId = null;

    try {
        const {
            items,
            address,
            phone,
            customer_name,
            payment_method,
            is_subscription,
            payment_proof_base64,
            delivery_slot
        } = req.body;

        const normalizedItems = [];
        const productIds = [];

        for (const item of items) {
            const productId = Number(item.product_id);
            const quantity = parseQuantity(item.quantity);
            if (!productId || !quantity) {
                return res.status(400).json({ message: 'Invalid order items' });
            }
            normalizedItems.push({ product_id: productId, quantity });
            productIds.push(productId);
        }

        const uniqueProductIds = [...new Set(productIds)];
        const products = await Product.find({ id: { $in: uniqueProductIds } });

        if (products.length !== uniqueProductIds.length) {
            return res.status(400).json({ message: 'Some products are not available' });
        }

        const productMap = new Map(products.map((p) => [Number(p.id), p]));
        let computedTotal = 0;
        const orderItems = [];

        for (const item of normalizedItems) {
            const product = productMap.get(item.product_id);
            if (!product) {
                return res.status(400).json({ message: `Invalid product ID ${item.product_id}` });
            }

            if (Number(product.stock || 0) < item.quantity) {
                return res.status(400).json({ message: `Insufficient stock for ${product.name}` });
            }

            computedTotal += Number(product.price) * item.quantity;
            orderItems.push({
                product_id: product.id,
                quantity: item.quantity,
                name: product.name,
                price: Number(product.price),
                image: product.image || ''
            });
        }

        const orderTotal = parseAmount(computedTotal);
        if (!orderTotal) {
            return res.status(400).json({ message: 'Invalid total amount' });
        }

        const normalizedMethod = String(payment_method || 'Cash on Delivery');
        let paymentStatus = 'not_required';
        if (normalizedMethod === 'UPI') paymentStatus = 'submitted';
        if (normalizedMethod === 'Wallet') paymentStatus = 'approved';

        if (normalizedMethod === 'Wallet') {
            const wallet = await ensureWallet(req.user.id);
            const balance = Number(wallet.balance || 0);
            if (balance < orderTotal) {
                return res.status(400).json({
                    message: `Insufficient wallet balance. Required: ${orderTotal.toFixed(
                        2
                    )}, Available: ${balance.toFixed(2)}`
                });
            }
        }

        // reduce stock
        for (const item of normalizedItems) {
            const updatedProduct = await Product.findOneAndUpdate({ id: item.product_id, stock: { $gte: item.quantity } }, { $inc: { stock: -item.quantity } }, { new: true });

            if (!updatedProduct) {
                for (const rollback of stockRollbacks) {
                    await Product.updateOne({ id: rollback.product_id }, { $inc: { stock: rollback.quantity } });
                }
                return res.status(400).json({
                    message: 'One or more products went out of stock. Please review your cart.'
                });
            }

            stockRollbacks.push(item);
        }

        const user = await User.findOne({ id: req.user.id });

        const normalizedDeliverySlot = String(delivery_slot || '').trim();

        const order = await Order.create({
            id: await nextSequence('order'),
            user_id: req.user.id,
            user_name: user ? user.name : '',
            email: user ? user.email : req.user.email,
            total_price: orderTotal,
            address,
            phone,
            customer_name,
            payment_method: normalizedMethod,
            status: 'Pending',
            payment_status: paymentStatus,
            is_subscription: is_subscription ? 1 : 0,
            wallet_deducted: 0,
            items: orderItems,
            delivery_slot: normalizedDeliverySlot
        });
        createdOrderId = order.id;

        if (normalizedMethod === 'UPI') {
            const imageUrl = saveBase64Image(payment_proof_base64, 'order-payments');
            const proof = await PaymentProof.create({
                id: await nextSequence('paymentProof'),
                user_id: req.user.id,
                type: 'order',
                reference_id: order.id,
                amount: orderTotal,
                image_url: imageUrl,
                status: 'submitted'
            });
            createdProofId = proof.id;

            order.payment_proof_id = proof.id;
            await order.save();
        }

        res.json({
            message: normalizedMethod === 'UPI' ?
                'Order submitted. Waiting for admin payment verification.' : 'Order placed successfully',
            orderId: order.id,
            total_price: orderTotal
        });
    } catch (error) {
        if (createdProofId !== null) {
            await PaymentProof.deleteOne({ id: createdProofId });
        }
        if (createdOrderId !== null) {
            await Order.deleteOne({ id: createdOrderId });
        }
        for (const rollback of stockRollbacks) {
            await Product.updateOne({ id: rollback.product_id }, { $inc: { stock: rollback.quantity } });
        }
        console.error('Order create error:', error);
        res.status(500).json({ message: 'Error placing order', error: error.message });
    }
});

/**
 * LIST ORDERS
 */
router.get('/', authMiddleware, async(req, res) => {
    try {
        const filter = req.user.role === 'admin' ? {} : { user_id: req.user.id };
        const orders = await Order.find(filter).sort({ id: -1 });
        res.json(cleanDocs(orders));
    } catch (error) {
        console.error('Orders fetch error:', error);
        res.status(500).json({ message: 'Error fetching orders', error: error.message });
    }
});

/**
 * SINGLE ORDER (invoice)
 */
router.get('/:id', authMiddleware, async(req, res) => {
    try {
        const orderId = Number(req.params.id);
        if (!orderId) return res.status(400).json({ message: 'Invalid order id' });

        const order = await Order.findOne({ id: orderId });
        if (!order) return res.status(404).json({ message: 'Order not found' });

        if (req.user.role !== 'admin' && order.user_id !== req.user.id) {
            return res.status(403).json({ message: 'Not allowed to view this order' });
        }

        const items = Array.isArray(order.items) ? order.items : [];

        res.json({
            id: order.id,
            created_at: order.createdAt,
            customer_name: order.customer_name,
            phone: order.phone,
            address: order.address,
            payment_method: order.payment_method || 'Cash on Delivery',
            payment_status: order.payment_status || 'not_required',
            is_subscription: !!order.is_subscription,
            total_price: Number(order.total_price || 0),
            handling: 0,
            delivery_slot: order.delivery_slot || '',
            items: items.map((i) => ({
                name: i.name,
                quantity: i.quantity,
                price: Number(i.price || 0)
            }))
        });
    } catch (error) {
        console.error('Single order fetch error:', error);
        res.status(500).json({ message: 'Error fetching order', error: error.message });
    }
});

/**
 * UPDATE ORDER STATUS
 * body: { status: 'Approved' | 'Packed' | 'Shipped' | 'Delivered' | 'Rejected' | ... }
 */
router.put(
    '/:id/status',
    authMiddleware,
    adminMiddleware,
    validateOrderStatusUpdate,
    async(req, res) => {
        try {
            const orderId = Number(req.params.id);
            const { status } = req.body;

            if (!orderId) {
                return res.status(400).json({ message: 'Invalid order id' });
            }

            const order = await Order.findOne({ id: orderId });
            if (!order) {
                return res.status(404).json({ message: 'Order not found' });
            }

            const oldStatus = order.status || 'Pending';
            const newStatus = String(status);

            // Prevent changing Delivered/Rejected orders
            if (['Delivered', 'Rejected'].includes(oldStatus) && oldStatus !== newStatus) {
                return res.status(400).json({
                    message: `Order is already ${oldStatus} and cannot be changed`
                });
            }

            // Wallet-specific handling
            if (order.payment_method === 'Wallet') {
                const wallet = await ensureWallet(order.user_id);
                const total = Number(order.total_price || 0);

                // Approve: deduct wallet if not already done
                if (newStatus === 'Approved' && !order.wallet_deducted) {
                    const balance = Number(wallet.balance || 0);
                    if (balance < total) {
                        return res.status(400).json({
                            message: 'Insufficient wallet balance to approve this order'
                        });
                    }

                    wallet.balance = Number((balance - total).toFixed(2));
                    await wallet.save();

                    await WalletTransaction.create({
                        id: await nextSequence('walletTxn'),
                        user_id: order.user_id,
                        type: 'debit',
                        amount: total,
                        reason: 'Order payment',
                        reference_type: 'order',
                        reference_id: order.id
                    });

                    order.wallet_deducted = 1;
                }

                // Reject: refund wallet if already deducted
                if (newStatus === 'Rejected' && order.wallet_deducted) {
                    wallet.balance = Number(
                        (Number(wallet.balance || 0) + total).toFixed(2)
                    );
                    await wallet.save();

                    await WalletTransaction.create({
                        id: await nextSequence('walletTxn'),
                        user_id: order.user_id,
                        type: 'credit',
                        amount: total,
                        reason: 'Order refund',
                        reference_type: 'order',
                        reference_id: order.id
                    });

                    order.wallet_deducted = 0;
                }
            }

            order.status = newStatus;
            await order.save();

            // Optional notification
            try {
                await Notification.create({
                    id: await nextSequence('notification'),
                    user_id: order.user_id,
                    type: 'order_status',
                    title: `Order #${order.id} status updated`,
                    message: `Your order status is now: ${newStatus}`,
                    reference_type: 'order',
                    reference_id: order.id,
                    is_read: 0
                });
            } catch (err) {
                console.error('Failed to create order status notification:', err);
            }

            res.json({
                message: 'Order status updated successfully',
                order: cleanDoc(order)
            });
        } catch (error) {
            console.error('Order status update error:', error);
            res.status(500).json({
                message: 'Error updating order status',
                error: error.message
            });
        }
    }
);

module.exports = router;