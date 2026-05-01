function validateEnv() {
    const required = ['MONGO_URI', 'JWT_SECRET', 'PORT'];
    const missing = required.filter((key) => !process.env[key] || !String(process.env[key]).trim());

    if (missing.length) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    if (String(process.env.JWT_SECRET).trim().length < 16) {
        throw new Error('JWT_SECRET is too short. Use at least 16 characters.');
    }

    const port = Number(process.env.PORT);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        throw new Error('PORT must be a valid integer between 1 and 65535.');
    }
}

module.exports = {
    validateEnv
};
