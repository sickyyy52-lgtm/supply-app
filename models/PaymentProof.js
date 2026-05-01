const { mongoose } = require('./db');

const paymentProofSchema = new mongoose.Schema({
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
        enum: ['order', 'wallet_topup'],
        required: true,
        index: true
    },
    reference_id: {
        type: Number,
        default: null,
        index: true
    },
    amount: {
        type: Number,
        default: null
    },
    image_url: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['submitted', 'approved', 'rejected'],
        default: 'submitted',
        index: true
    },
    admin_notes: {
        type: String,
        default: null
    },
    reviewed_by: {
        type: Number,
        default: null
    },
    reviewed_at: {
        type: Date,
        default: null
    }
}, { timestamps: true });

module.exports = mongoose.model('PaymentProof', paymentProofSchema);
