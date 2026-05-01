const { mongoose } = require('./db');

const walletSchema = new mongoose.Schema({
    user_id: {
        type: Number,
        required: true,
        unique: true,
        index: true
    },
    balance: {
        type: Number,
        required: true,
        default: 0,
        min: 0
    }
}, { timestamps: true });

module.exports = mongoose.model('Wallet', walletSchema);
