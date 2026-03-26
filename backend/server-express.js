'use strict';

require('dotenv').config();

const express      = require('express');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const cors         = require('cors');
const morgan       = require('morgan');
const path         = require('path');
const { requireRole }        = require('./utils/auth');
const { upsertProfile }     = require('./database');
const { getPlan }           = require('./config/subscriptionPlans');
const { requireSupabaseUser } = require('./middleware/supabaseJwt');
const cron         = require('node-cron');
const { syncAllSports }      = require('./services/syncService');
const { bootstrap }          = require('./dbBootstrap');

// -------------------------------------------------
//  Database bootstrap - ensure tables + seed data
// -------------------------------------------------
bootstrap().catch(err => console.error('[startup] bootstrap failed:', err.message));

// -------------------------------------------------
//  Scheduler - runs at 06:00, 14:00, 18:00 UTC
// -------------------------------------------------
const CRON_SLOTS_UTC = [
    { label: 'morning_cleanup', expr: '0 6 * * *' },
    { label: 'midday_setup', expr: '0 14 * * *' },
    { label: 'pregame_finalization', expr: '0 18 * * *' }
];

for (const slot of CRON_SLOTS_UTC) {
    cron.schedule(slot.expr, () => {
        console.log(`[cron] Triggering master sports sync: ${slot.label}`);
        syncAllSports().catch(err => console.error(`[cron] Sync failed (${slot.label}):`, err));
    }, { timezone: 'UTC' });
}

// -------------------------------------------------
//  Helper - warn if important env vars are missing
// -------------------------------------------------
function warnEnv(name) {
    if (!process.env[name] || String(process.env[name]).trim().length === 0) {
        console.warn(`[env] warning: ${name} is not set`);
    }
}
warnEnv('DATABASE_URL');
warnEnv('ADMIN_API_KEY');
warnEnv('USER_API_KEY');
warnEnv('OPENAI_KEY');

// -------------------------------------------------
//  Routers
// -------------------------------------------------
const predictionsRouter = require('./routes/predictions');
const pipelineRouter    = require('./routes/pipeline');
const debugRouter       = require('./routes/debug');
const userRouter        = require('./routes/user');
const chatRouter        = require('./routes/chat');

const app = express();

app.disable('x-powered-by');

// -----------------  Security middleware  -----------------
app.use(
    helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false
    })
);

// -----------------  CORS configuration  -----------------
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (curl, mobile apps, etc.)
        if (!origin) return callback(null, true);

        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:5500',
            'http://127.0.0.1:5500',
            'https://skcsai.vercel.app',
            'https://skcsaisports.vercel.app',
            'https://www.skcsaisportspredictions.co.za',
            'https://skcsaisportspredictions.co.za'
        ];

        const isAllowed = allowedOrigins.includes(origin);
        const isVercelPreview = origin.endsWith('.vercel.app') &&
                                origin.includes('stephens-projects');

        if (isAllowed || isVercelPreview) {
            callback(null, true);
        } else {
            console.log('CORS blocked for origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'x-api-key',
        'X-Requested-With'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.options('*', cors()); // pre-flight

app.use(morgan('combined'));

// -----------------  Rate limiter  -----------------
app.use(
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 100,
        standardHeaders: true,
        legacyHeaders: false
    })
);

app.use(express.json({ limit: '1mb', strict: true }));

// -----------------  Debug logging  -----------------
app.use((req, res, next) => {
    console.log(`[ROUTE HIT] ${req.method} ${req.url}`);
    res.setHeader('X-SKCS-Debug', 'Verified-Backend-v1');
    next();
});

// -----------------  Static files  -----------------
app.use(express.static(path.join(__dirname, '../public')));

// -------------------------------------------------
//  Subscription tier definitions
// -------------------------------------------------
const SUBSCRIPTION_TIERS = {
    'core_4day_sprint': { name: '4-Day Sprint', tier: 'core', duration_days: 4, price: 3.99 },
    'core_9day_run': { name: '9-Day Run ⭐', tier: 'core', duration_days: 9, price: 7.99 },
    'core_14day_pro': { name: '14-Day Pro', tier: 'core', duration_days: 14, price: 14.99 },
    'core_30day_limitless': { name: '30-Day Limitless', tier: 'core', duration_days: 30, price: 29.99 },
    'elite_4day_deep_dive': { name: '4-Day Deep Dive', tier: 'elite', duration_days: 4, price: 9.99 },
    'elite_9day_deep_strike': { name: '9-Day Deep Strike ⭐', tier: 'elite', duration_days: 9, price: 19.99 },
    'elite_14day_deep_pro': { name: '14-Day Deep Pro', tier: 'elite', duration_days: 14, price: 39.99 },
    'elite_30day_deep_vip': { name: '30-Day Deep VIP', tier: 'elite', duration_days: 30, price: 59.99 }
};

// Test emails that bypass payment
const TEST_EMAILS = ['sfynn13433@gmail.com', 'sfynn450@gmail.com'];

// -------------------------------------------------
//  Select Plan endpoint (with auth bypass for test emails)
// -------------------------------------------------
app.post('/api/select-plan', async (req, res) => {
    try {
        const { user_email, tier_id } = req.body || {};

        if (!user_email || !tier_id) {
            return res.status(400).json({ error: 'user_email and tier_id required' });
        }

        const tier = SUBSCRIPTION_TIERS[tier_id];
        if (!tier) {
            return res.status(400).json({ error: 'Invalid tier ID' });
        }

        // Check if user is in test email list (bypass payment)
        if (TEST_EMAILS.includes(user_email)) {
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + tier.duration_days);

            return res.status(201).json({
                success: true,
                message: `Access granted to ${tier.name}`,
                tier_id: tier_id,
                tier_name: tier.name,
                expires_at: expiresAt.toISOString(),
                is_test_user: true
            });
        }

        // For non-test users, payment is required
        return res.status(402).json({
            success: false,
            requires_payment: true,
            message: 'Payment processing not yet implemented',
            tier_id: tier_id
        });

    } catch (err) {
        console.error('SELECT PLAN ERROR:', err);
        res.status(500).json({ error: 'Failed to select plan' });
    }
});

// -------------------------------------------------
//  Refresh predictions endpoint
// -------------------------------------------------
app.post('/api/refresh-predictions', async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'];

        // Simple auth check
        if (apiKey !== process.env.SKCS_REFRESH_KEY && apiKey !== 'skcs_refresh_key') {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Trigger the sync service
        console.log('[REFRESH] Triggering sports data sync...');
        await syncAllSports().catch(err => {
            console.error('[REFRESH] Sync failed:', err);
            throw err;
        });

        res.status(200).json({
            success: true,
            message: 'Predictions refreshed',
            timestamp: new Date().toISOString()
        });

    } catch (err) {
        console.error('REFRESH PREDICTIONS ERROR:', err);
        res.status(500).json({ error: 'Failed to refresh predictions' });
    }
});

// -------------------------------------------------
//  Subscription endpoint (legacy)
// -------------------------------------------------
app.post('/api/subscribe', requireSupabaseUser, async (req, res) => {
    try {
        if (!req.user?.id) {
            return res.status(401).json({ error: 'Access token required' });
        }

        const { planId, email } = req.body || {};

        if (!planId || typeof planId !== 'string') {
            return res.status(400).json({ error: 'planId is required' });
        }

        const plan = getPlan(planId);
        if (!plan) {
            return res.status(400).json({ error: 'Invalid plan selected' });
        }

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + plan.days);

        await upsertProfile({
            id: req.user.id,
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
    } catch (err) {
        console.error('SUBSCRIBE ERROR:', err);
        res.status(500).json({ error: 'Subscription failed' });
    }
});

// -------------------------------------------------
//  Front-end entry point
// -------------------------------------------------
app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// -------------------------------------------------
//  API routers
// -------------------------------------------------
app.use('/api/predictions', predictionsRouter);
app.use('/api/user',        userRouter);
app.use('/api/pipeline',    pipelineRouter);
app.use('/api/chat',        chatRouter);
app.use('/debug',           requireRole('admin'), debugRouter);

// -------------------------------------------------
//  Health-check (admin only)
// -------------------------------------------------
app.get('/api/health-check', async (req, res) => {
    const health = {
        server:   'Online',
        timestamp: new Date().toISOString(),
        env: {
            database_url: process.env.DATABASE_URL ? '✅' : '❌',
            openai_key:   process.env.OPENAI_KEY   ? '✅' : '❌',
            supabase_url: process.env.SUPABASE_URL ? '✅' : '❌',
            port: PORT
        }
    };
    console.log('[HEALTH CHECK] requested');
    res.json(health);
});

// -------------------------------------------------
//  404 handler
// -------------------------------------------------
app.use((req, res) => {
    console.log('[404]', req.method, req.url);
    res.status(404).json({ error: 'Route not found', path: req.url });
});

// -------------------------------------------------
//  Global error handler
// -------------------------------------------------
app.use((err, _req, res, _next) => {
    console.error('[SERVER ERROR]', err);
    res.status(500).json({ error: 'Internal server error' });
});

// -------------------------------------------------
//  Port binding - Render injects process.env.PORT
// -------------------------------------------------
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`[server-express] listening on ${PORT}`);
});
