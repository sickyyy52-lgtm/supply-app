const DEFAULT_PORT = 3001;

function getEnvValue(env, key) {
    return env[key] && String(env[key]).trim();
}

function getMongoUri(env = process.env) {
    return getEnvValue(env, 'MONGO_URI') || getEnvValue(env, 'MONGODB_URI');
}

function getMongoHost(mongoUri) {
    try {
        const parsed = new URL(mongoUri);
        return parsed.host || 'unknown host';
    } catch (error) {
        return 'unparseable host';
    }
}

function validateEnv(env = process.env) {
    const missing = [];
    const mongoUri = getMongoUri(env);
    const jwtSecret = getEnvValue(env, 'JWT_SECRET');

    if (!mongoUri) {
        missing.push('MONGO_URI');
    }

    if (!jwtSecret) {
        missing.push('JWT_SECRET');
    }

    if (missing.length) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    if (jwtSecret.length < 16) {
        throw new Error('JWT_SECRET is too short. Use at least 16 characters.');
    }

    const rawPort = getEnvValue(env, 'PORT') || String(DEFAULT_PORT);
    const port = Number(rawPort);

    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        throw new Error('PORT must be a valid integer between 1 and 65535.');
    }

    return {
        port,
        mongoUri,
        mongoHost: getMongoHost(mongoUri),
        portSource: getEnvValue(env, 'PORT') ? 'PORT' : 'default'
    };
}

function getStartupConfigSummary(config, env = process.env) {
    return {
        nodeEnv: getEnvValue(env, 'NODE_ENV') || 'development',
        port: `${config.port}${config.portSource === 'PORT' ? ' (from process.env.PORT)' : ' (default)'}`,
        mongoUri: `set (${config.mongoHost})`,
        jwtSecret: `set (${getEnvValue(env, 'JWT_SECRET').length} chars)`
    };
}

module.exports = {
    validateEnv,
    getStartupConfigSummary
};
