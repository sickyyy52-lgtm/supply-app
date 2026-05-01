const { mongoose } = require('./db');

const walletTransactionSchema = new mongoose.Schema({
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
    type: {
        type: String,
        enum: ['credit', 'debit'],
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    reason: {
        type: String,
        required: true
    },
    reference_type: {
        type: String,
        default: null
    },
    reference_id: {
        type: Number,
        default: null
    },
    created_by: {
        type: Number,
        default: null
    }
}, { timestamps: true });

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
