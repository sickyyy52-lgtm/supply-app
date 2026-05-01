const { mongoose } = require('./db');

const notificationSchema = new mongoose.Schema({
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
    order_id: {
        type: Number,
        default: null
    },
    message: {
        type: String,
        required: true
    },
    is_read: {
        type: Number,
        default: 0
    }
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
