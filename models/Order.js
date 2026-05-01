const { mongoose } = require('./db');

const orderItemSchema = new mongoose.Schema({
    product_id: {
        type: Number,
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    },
    name: {
        type: String,
        required: true
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    image: {
        type: String,
        default: ''
    }
}, { _id: false });

const orderSchema = new mongoose.Schema({
    id: {
        type: Number,
        required: true,
        unique: true,
        index: true
    },
    user_id: {
        type: Number,
        required: true,
        index: true
    },
    user_name: {
        type: String,
        default: ''
    },
    email: {
        type: String,
        default: ''
    },
    total_price: {
        type: Number,
        required: true,
        min: 0
    },
    address: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true
    },
    customer_name: {
        type: String,
        required: true
    },
    payment_method: {
        type: String,
        enum: ['Cash on Delivery', 'UPI', 'Wallet'],
        default: 'Cash on Delivery'
    },

    // NEW: delivery slot
    delivery_slot: {
        type: String,
        enum: ['', 'morning', 'afternoon', 'evening'], // '' = any time
        default: ''
    },

    status: {
        type: String,
        enum: ['Pending', 'Approved', 'Packed', 'Shipped', 'Delivered', 'Cancelled', 'Rejected'],
        default: 'Pending',
        index: true
    },
    payment_status: {
        type: String,
        enum: ['not_required', 'submitted', 'approved', 'rejected'],
        default: 'not_required'
    },
    payment_proof_id: {
        type: Number,
        default: null
    },
    is_subscription: {
        type: Number,
        default: 0
    },
    wallet_deducted: {
        type: Number,
        default: 0
    },
    items: {
        type: [orderItemSchema],
        default: []
    }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);