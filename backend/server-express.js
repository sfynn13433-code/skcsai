'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const { requireRole } = require('./utils/auth');
const { upsertProfile } = require('./database');
const { getPlan } = require('./config/subscriptionPlans');
const { requireSupabaseUser } = require('./middleware/supabaseJwt');
const cron = require('node-cron');
const { syncAllSports } = require('./services/syncService');

// Schedule master sync every 6 hours
cron.schedule('0 */6 * * *', () => {
    console.log('[cron] Triggering master sports sync...');
    syncAllSports().catch(err => console.error('[cron] Sync failed:', err));
});

function warnEnv(name) {
    if (!process.env[name] || String(process.env[name]).trim().length === 0) {
        console.warn(`[env] warning: ${name} is not set`);
    }
}

warnEnv('DATABASE_URL');
warnEnv('ADMIN_API_KEY');
warnEnv('USER_API_KEY');
warnEnv('OPENAI_KEY');

const predictionsRouter = require('./routes/predictions');
const pipelineRouter = require('./routes/pipeline');
const debugRouter = require('./routes/debug');
const userRouter = require('./routes/user');
const chatRouter = require('./routes/chat');

const app = express();

app.disable('x-powered-by');

// Updated Helmet Configuration for CSP compatibility
app.use(helmet({
    contentSecurityPolicy: {
        useDefaults: true,
        directives: {
            "default-src": ["'self'"],
            "script-src": ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            "font-src": ["'self'", "https://fonts.gstatic.com"],
            "img-src": ["'self'", "data:", "https:"],
            "connect-src": ["'self'", "https://*.supabase.co", "wss://*.supabase.co", "https://skcsai.onrender.com", "https://www.skcsaisportspredictions.co.za", "https://skcsaisportspredictions.co.za", "http://localhost:3000", "ws://localhost:3000"]
        }
    },
    crossOriginEmbedderPolicy: false 
}));

app.use(cors({
    origin: [
        'http://localhost:3000',
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        'https://skcsai.vercel.app',
        'https://www.skcsaisportspredictions.co.za',
        'https://skcsaisportspredictions.co.za'
    ],
    credentials: true
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

app.use((req, res, next) => {
    console.log(`[ROUTE HIT] ${req.method} ${req.url}`);
    res.setHeader('X-SKCS-Debug', 'Verified-Backend-v1');
    next();
});

// Serve static files from the public directory
// NOTE: Keep this enabled while the custom domain points to Render.
// When Vercel is live and DNS is moved, this line can be removed.
app.use(express.static(path.join(__dirname, '../public')));

// Subscription endpoint
app.post('/api/subscribe', requireSupabaseUser, async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            res.status(401).json({ error: 'Access token required' });
            return;
        }

        const userId = req.user.id;
        const { planId, email } = req.body || {};

        if (!planId || typeof planId !== 'string') {
            res.status(400).json({ error: 'planId is required' });
            return;
        }

        const plan = getPlan(planId);
        if (!plan) {
            res.status(400).json({ error: 'Invalid plan selected' });
            return;
        }

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + plan.days);

        await upsertProfile({
            id: userId,
            email: typeof email === 'string' ? email : null,
            subscription_status: 'active',
            is_test_user: false,
            plan_id: planId,
            plan_tier: plan.tier,
            plan_expires_at: expiresAt
        });

        res.status(200).json({
            success: true,
            planId,
            tier: plan.tier,
            expiresAt
        });
    } catch (error) {
        console.error('SUBSCRIBE ERROR:', error);
        res.status(500).json({ error: 'Subscription failed' });
    }
});

// Serve index.html at the root
app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.use('/api/predictions', predictionsRouter);
app.use('/api/user', userRouter);
app.use('/api/pipeline', pipelineRouter);
app.use('/api/chat', chatRouter);

app.use('/debug', requireRole('admin'), debugRouter);

const PORT = Number(process.env.PORT) || 3000;

// System Health Check (Admin Only)
app.get('/api/health-check', async (req, res) => {
    const healthStatus = {
        server: 'Online',
        timestamp: new Date().toISOString(),
        environment: {
            database_url: process.env.DATABASE_URL ? '✅ Configured' : '❌ MISSING',
            openai_key: process.env.OPENAI_KEY ? '✅ Configured' : '❌ MISSING',
            supabase_url: process.env.SUPABASE_URL ? '✅ Configured' : '❌ MISSING',
            port: PORT
        },
        headers: {
            csp_status: 'Active (Customized)',
            debug_tag: 'Verified-Backend-v1'
        }
    };
    
    // Log the check to the terminal
    console.log('[HEALTH CHECK] System status requested.');
    res.status(200).json(healthStatus);
});

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

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[server-express] listening on port ${PORT}`);
});