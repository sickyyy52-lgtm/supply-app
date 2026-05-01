const { mongoose } = require('./db');

const counterSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true
    },
    seq: {
        type: Number,
        required: true,
        default: 0
    }
}, { timestamps: true });

const Counter = mongoose.model('Counter', counterSchema);

async function nextSequence(key) {
    const counter = await Counter.findOneAndUpdate(
        { key },
        { $inc: { seq: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return counter.seq;
}

module.exports = {
    Counter,
    nextSequence
};
