require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const { connectDb, mongoose } = require('./models/db');

const authRoutes = require('./routes/auth');
const cartRoutes = require('./routes/cart');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const paymentRoutes = require('./routes/payments');
const walletRoutes = require('./routes/wallet');
const { validateEnv, getStartupConfigSummary } = require('./utils/env');

const app = express();
const uploadsDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/healthz', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

app.get('/readyz', (req, res) => {
    const connected = mongoose.connection.readyState === 1;
    res.status(connected ? 200 : 503).json({
        status: connected ? 'ready' : 'not_ready',
        database: connected ? 'connected' : 'disconnected'
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/wallet', walletRoutes);

app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/menu', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'menu.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/cart', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'cart.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use('/api', (req, res) => {
    res.status(404).json({ message: 'API route not found' });
});

app.use((req, res) => {
    res.status(404).send('Page not found');
});

app.use((err, req, res, next) => {
    console.error('Global server error:', err);
    res.status(500).json({
        message: 'Internal server error',
        error: err.message
    });
});

function normalizeError(error) {
    if (error instanceof Error) return error;
    return new Error(typeof error === 'string' ? error : JSON.stringify(error));
}

function logErrorDetails(label, error) {
    const normalizedError = normalizeError(error);
    console.error(`[${label}] ${normalizedError.name}: ${normalizedError.message}`);

    if (normalizedError.cause) {
        console.error(`[${label}] Cause: ${normalizedError.cause.message || normalizedError.cause}`);
    }

    if (normalizedError.stack) {
        console.error(normalizedError.stack);
    }
}

function logMongoStartupHints(error) {
    const normalizedError = normalizeError(error);
    const isMongoError = normalizedError.name.startsWith('Mongo') ||
        normalizedError.message.toLowerCase().includes('mongodb') ||
        Boolean(normalizedError.reason);

    if (!isMongoError) return;

    console.error('[startup] MongoDB connection failed before the HTTP server started.');
    console.error('[startup] Check MONGO_URI/MONGODB_URI, database username/password, Atlas IP access list, TLS/network access, and cluster availability.');

    if (normalizedError.reason && normalizedError.reason.servers instanceof Map) {
        const servers = [...normalizedError.reason.servers.entries()]
            .map(([host, description]) => `${host}=${description.type || 'unknown'}`)
            .join(', ');

        if (servers) {
            console.error(`[startup] MongoDB server states: ${servers}`);
        }
    }
}

function logStartupConfig(config) {
    const summary = getStartupConfigSummary(config);
    console.log('[startup] Configuration validated.');
    console.log(`[startup] NODE_ENV: ${summary.nodeEnv}`);
    console.log(`[startup] PORT: ${summary.port}`);
    console.log(`[startup] MONGO_URI: ${summary.mongoUri}`);
    console.log(`[startup] JWT_SECRET: ${summary.jwtSecret}`);
}

function logStartupFailure(error) {
    console.error('================ STARTUP FAILED ================');
    logErrorDetails('startup', error);
    logMongoStartupHints(error);
    console.error('================================================');
}

process.on('unhandledRejection', (reason) => {
    logErrorDetails('unhandledRejection', reason);
});

process.on('uncaughtException', (error) => {
    logErrorDetails('uncaughtException', error);
    process.exit(1);
});

async function startServer() {
    let config;

    try {
        config = validateEnv();
        logStartupConfig(config);
    } catch (error) {
        logStartupFailure(error);
        process.exit(1);
    }

    try {
        console.log('[startup] Connecting to MongoDB...');
        await connectDb(config.mongoUri);
        console.log('[startup] MongoDB connected and ping verified.');

        await new Promise((resolve, reject) => {
            const server = app.listen(config.port, () => {
                console.log(`[startup] Server running on port ${config.port}`);
                resolve(server);
            });

            server.on('error', (error) => {
                reject(error);
            });
        });
    } catch (error) {
        logStartupFailure(error);
        process.exit(1);
    }
}

startServer();
