const { mongoose } = require('./db');

const cartItemSchema = new mongoose.Schema({
    product_id: {
        type: Number,
        required: true
    },
    quantity: {
        type: Number,
        required: true,
        min: 1
    }
}, { _id: false });

const cartSchema = new mongoose.Schema({
    user_id: {
        type: Number,
        required: true,
        unique: true,
        index: true
    },
    items: {
        type: [cartItemSchema],
        default: []
    }
}, { timestamps: true });

module.exports = mongoose.model('Cart', cartSchema);
