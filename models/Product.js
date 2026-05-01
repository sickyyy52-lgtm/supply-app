const { mongoose } = require('./db');

const productSchema = new mongoose.Schema({
    id: {
        type: Number,
        required: true,
        unique: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    category: {
        type: String,
        required: true,
        trim: true
    },
    price: {
        type: Number,
        required: true,
        min: 0
    },
    image: {
        type: String,
        required: true
    },
    stock: {
        type: Number,
        required: true,
        default: 0,
        min: 0
    }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
