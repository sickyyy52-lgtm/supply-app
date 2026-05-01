const { mongoose } = require('./db');

const walletTopupSchema = new mongoose.Schema({
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
    requested_amount: {
        type: Number,
        required: true,
        min: 0
    },
    status: {
        type: String,
        enum: ['submitted', 'approved', 'rejected'],
        default: 'submitted',
        index: true
    },
    proof_id: {
        type: Number,
        default: null
    },
    approved_by: {
        type: Number,
        default: null
    },
    approved_at: {
        type: Date,
        default: null
    },
    admin_notes: {
        type: String,
        default: null
    }
}, { timestamps: true });

module.exports = mongoose.model('WalletTopup', walletTopupSchema);
