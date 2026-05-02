const mongoose = require('mongoose');

const passwordResetRequestSchema = new mongoose.Schema({
    id: { type: Number, unique: true }, // Counter se unique numeric id
    user_id: { type: Number, required: true },
    email: { type: String },
    phone: { type: String },
    note: { type: String }, // user ka message
    status: { type: String, default: 'pending' }, // pending / approved / rejected
    admin_note: { type: String },
    temp_password_set: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('PasswordResetRequest', passwordResetRequestSchema);