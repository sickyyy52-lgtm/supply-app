const mongoose = require('mongoose');

let connectionPromise = null;
let connectionLoggingAttached = false;

function getMongoTimeoutMs() {
    const timeout = Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 15000);
    return Number.isInteger(timeout) && timeout > 0 ? timeout : 15000;
}

function attachConnectionLogging() {
    if (connectionLoggingAttached) return;

    mongoose.connection.on('error', (error) => {
        console.error('[mongodb] Connection error:', error.message);
    });

    mongoose.connection.on('disconnected', () => {
        console.error('[mongodb] Disconnected from database.');
    });

    mongoose.connection.on('reconnected', () => {
        console.log('[mongodb] Reconnected to database.');
    });

    connectionLoggingAttached = true;
}

function connectDb(mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI) {
    if (connectionPromise) return connectionPromise;

    if (!mongoUri || !String(mongoUri).trim()) {
        throw new Error('Missing required environment variable: MONGO_URI');
    }

    mongoose.set('strictQuery', true);
    attachConnectionLogging();

    connectionPromise = (async() => {
        try {
            const timeoutMs = getMongoTimeoutMs();
            const connection = await mongoose.connect(String(mongoUri).trim(), {
                serverSelectionTimeoutMS: timeoutMs,
                connectTimeoutMS: timeoutMs
            });

            if (!connection.connection.db) {
                throw new Error('MongoDB connected without an active database handle.');
            }

            await connection.connection.db.admin().ping();
            return connection;
        } catch (error) {
            connectionPromise = null;

            try {
                await mongoose.disconnect();
            } catch (disconnectError) {
                console.error('[mongodb] Failed to cleanly disconnect after connection error:', disconnectError.message);
            }

            throw error;
        }
    })();

    return connectionPromise;
}

module.exports = {
    connectDb,
    mongoose
};
