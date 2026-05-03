const { mongoose } = require('./db');

const paymentSettingSchema = new mongoose.Schema({
    id: {
        type: Number,
        required: true,
        unique: true,
        index: true
    },
    upi_id: {
        type: String,
        required: true,
        trim: true
    },
    qr_image_url: {
        type: String,
        default: null
    },
    last_valid_qr_image_url: {
        type: String,
        default: null
    },
    is_active: {
        type: Number,
        default: 1,
        index: true
    },
    created_by: {
        type: Number,
        default: null
    },
    updated_by: {
        type: Number,
        default: null
    }
}, { timestamps: true });

module.exports = mongoose.model('PaymentSetting', paymentSettingSchema);
