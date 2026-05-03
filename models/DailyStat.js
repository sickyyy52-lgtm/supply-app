const { mongoose } = require('./db');

const dailyStatSchema = new mongoose.Schema({
    date: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    day_label: {
        type: String,
        default: ''
    },
    revenue: {
        type: Number,
        default: 0
    },
    profit: {
        type: Number,
        default: 0
    },
    cod_revenue: {
        type: Number,
        default: 0
    },
    upi_revenue: {
        type: Number,
        default: 0
    },
    wallet_revenue: {
        type: Number,
        default: 0
    },
    total_orders: {
        type: Number,
        default: 0
    },
    paid_orders: {
        type: Number,
        default: 0
    },
    conversion_rate: {
        type: Number,
        default: 0
    },
    product_cost: {
        type: Number,
        default: 0
    },
    delivery_cost: {
        type: Number,
        default: 0
    },
    cod_returns: {
        type: Number,
        default: 0
    },
    refunds: {
        type: Number,
        default: 0
    },
    payment_fail_loss: {
        type: Number,
        default: 0
    },
    cod_cancellations: {
        type: Number,
        default: 0
    },
    failed_payments: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

module.exports = mongoose.model('DailyStat', dailyStatSchema, 'daily_stats');
