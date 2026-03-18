'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const morgan = require('morgan');
const { requireRole } = require('./utils/auth');

function warnEnv(name) {
    if (!process.env[name] || String(process.env[name]).trim().length === 0) {
        console.warn(`[env] warning: ${name} is not set`);
    }
}

warnEnv('DATABASE_URL');
warnEnv('ADMIN_API_KEY');
warnEnv('USER_API_KEY');

const predictionsRouter = require('./routes/predictions');
const pipelineRouter = require('./routes/pipeline');
const debugRouter = require('./routes/debug');
const userRouter = require('./routes/user');

const app = express();

app.disable('x-powered-by');

app.use(helmet());

app.use(cors({
    origin: '*'
}));

app.use(morgan('combined'));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false
});

app.use(limiter);

app.use(express.json({ limit: '1mb', strict: true }));

app.use((req, _res, next) => {
    console.log(`[ROUTE HIT] ${req.method} ${req.url}`);
    next();
});

app.get('/', (_req, res) => {
    res.status(200).json({ status: 'SKCS backend running' });
});

app.use('/api/predictions', predictionsRouter);
app.use('/api/user', userRouter);
app.use('/api/pipeline', pipelineRouter);

app.use('/debug', requireRole('admin'), debugRouter);

app.use((req, res) => {
    console.log('[404]', req.method, req.url);
    res.status(404).json({
        error: 'Route not found',
        path: req.url
    });
});

app.use((err, _req, res, _next) => {
    console.error('[server-express] error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[server-express] listening on port ${PORT}`);
});
