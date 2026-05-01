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
const { validateEnv } = require('./utils/env');

const app = express();
const PORT = process.env.PORT;
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

async function startServer() {
    try {
        validateEnv();
    } catch (error) {
        console.error('Environment validation failed:', error.message);
        console.error('Server not started because required configuration is missing or invalid.');
        process.exit(1);
    }

    try {
        console.log('Connecting to MongoDB...');
        await connectDb();
        console.log('MongoDB connected successfully.');
        await new Promise((resolve, reject) => {
            const server = app.listen(PORT, () => {
                console.log(`Server running on http://localhost:${PORT}`);
                resolve(server);
            });

            server.on('error', (error) => {
                reject(error);
            });
        });
    } catch (error) {
        if (error.name === 'MongoServerSelectionError' || error.name === 'MongooseServerSelectionError') {
            console.error('MongoDB connection failed:', error.message);
            console.error('Server not started because a database connection could not be established.');
        } else if (error.code === 'EADDRINUSE') {
            console.error(`Server startup failed: port ${PORT} is already in use.`);
            console.error('Server not started because the configured port is unavailable.');
        } else {
            console.error('Server startup failed:', error.message);
            console.error('Server not started because an unexpected startup error occurred.');
        }
        process.exit(1);
    }
}

startServer();
