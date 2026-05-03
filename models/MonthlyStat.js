const { mongoose } = require('./db');

const monthlyStatSchema = new mongoose.Schema({
    month: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    total_revenue: {
        type: Number,
        default: 0
    },
    total_profit: {
        type: Number,
        default: 0
    },
    total_orders: {
        type: Number,
        default: 0
    },
    cod_percentage: {
        type: Number,
        default: 0
    },
    upi_percentage: {
        type: Number,
        default: 0
    },
    wallet_percentage: {
        type: Number,
        default: 0
    },
    best_day: {
        date: { type: String, default: '' },
        revenue: { type: Number, default: 0 }
    },
    worst_day: {
        date: { type: String, default: '' },
        revenue: { type: Number, default: 0 }
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
    }
}, { timestamps: true });

module.exports = mongoose.model('MonthlyStat', monthlyStatSchema, 'monthly_stats');
