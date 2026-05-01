const mongoose = require('mongoose');

let connectionPromise = null;

function connectDb() {
    if (connectionPromise) return connectionPromise;

    if (!process.env.MONGO_URI || !String(process.env.MONGO_URI).trim()) {
        throw new Error('Missing required environment variable: MONGO_URI');
    }

    mongoose.set('strictQuery', true);

    connectionPromise = mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 10000
    });

    return connectionPromise;
}

module.exports = {
    connectDb,
    mongoose
};
