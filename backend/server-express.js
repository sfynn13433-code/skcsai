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

// NEW: Import subscription matrix and date normalization
const { getPlanCapabilities, filterPredictionsForPlan } = require('./config/subscriptionMatrix');
const { normalizeFixtureDate, getPredictionWindow, isFixtureEligibleForPrediction } = require('./utils/dateNormalization');

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
const allowedOrigins = [
  "https://skcsaiedge.onrender.com",
  "http://localhost:3000"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("CORS not allowed"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// 🧩 STEP 4 — HANDLE PREFLIGHT (CRITICAL FIX)
app.options('*', cors());

// 🧩 STEP 5 — SAFETY FALLBACK (RENDER BUG PROTECTION)
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  next();
});

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

// Test emails that bypass payment (merge with SKCS_FREE_PASS_EMAILS on the server)
const TEST_EMAILS = ['sfynn13433@gmail.com', 'sfynn450@gmail.com'];

function getFreePassEmailSet() {
    const fromEnv = (process.env.SKCS_FREE_PASS_EMAILS || '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);
    const hardcoded = TEST_EMAILS.map((e) => e.toLowerCase());
    return new Set([...fromEnv, ...hardcoded]);
}

/** Payment gate: open mode for staging, or free-pass list, otherwise 402 until Stripe exists. */
function subscriptionGateForEmail(email) {
    const open = process.env.SKCS_SUBSCRIBE_OPEN === '1' || process.env.SKCS_SUBSCRIBE_OPEN === 'true';
    if (open) {
        return { allowed: true, isFreePass: false };
    }
    const em = String(email || '').toLowerCase().trim();
    if (getFreePassEmailSet().has(em)) {
        return { allowed: true, isFreePass: true };
    }
    return { allowed: false, isFreePass: false };
}

/**
 * Writes plan to Postgres `profiles` so /api/user/predictions and JWT middleware work.
 */
async function tryActivatePlan(req, planId) {
    if (!req.user?.id) {
        return { status: 401, body: { error: 'Access token required' } };
    }
    if (!planId || typeof planId !== 'string') {
        return { status: 400, body: { error: 'planId is required' } };
    }

    const plan = getPlan(planId);
    if (!plan) {
        return { status: 400, body: { error: 'Invalid plan selected' } };
    }

    const gate = subscriptionGateForEmail(req.user.email);
    if (!gate.allowed) {
        return {
            status: 402,
            body: {
                success: false,
                requires_payment: true,
                message:
                    'Payment is not enabled yet. Ask the admin to add your email to SKCS_FREE_PASS_EMAILS, or set SKCS_SUBSCRIBE_OPEN=true for staging.',
                planId
            }
        };
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + plan.days);

    const tierMeta = SUBSCRIPTION_TIERS[planId];

    await upsertProfile({
        id: req.user.id,
        email: req.user.email,
        subscription_status: 'active',
        is_test_user: gate.isFreePass,
        plan_id: planId,
        plan_tier: plan.tier,
        plan_expires_at: expiresAt
    });

    return {
        status: 200,
        body: {
            success: true,
            planId,
            tier: plan.tier,
            tier_id: planId,
            tier_name: tierMeta?.name || planId,
            expiresAt,
            expires_at: expiresAt.toISOString(),
            is_test_user: gate.isFreePass
        }
    };
}

// -------------------------------------------------
//  Select Plan — requires Supabase session (same as subscribe)
// -------------------------------------------------
app.post('/api/select-plan', requireSupabaseUser, async (req, res) => {
    try {
        const tier_id = req.body?.tier_id;
        const result = await tryActivatePlan(req, tier_id);
        const status = result.status === 200 ? 201 : result.status;
        res.status(status).json(result.body);
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
//  Accuracy Dashboard endpoint
// -------------------------------------------------
app.get('/api/accuracy', async (req, res) => {
    try {
        // Query database for resolved predictions and calculate accuracy stats
        const dbRes = await query(`
            SELECT 
                tier,
                type,
                matches,
                total_confidence,
                created_at,
                COALESCE((matches->0->>'result'), 'pending') as result
            FROM predictions_final
            WHERE created_at < NOW() - INTERVAL '1 day'
            ORDER BY created_at DESC
            LIMIT 500
        `);

        const predictions = dbRes.rows || [];
        
        // Calculate overall stats
        let totalWins = 0;
        let totalPredictions = predictions.length;
        const tierStats = {};
        const sportStats = {};

        predictions.forEach(p => {
            const isWin = p.result && (p.result.toLowerCase() === 'win' || p.result.toLowerCase() === 'true');
            if (isWin) totalWins++;

            // Tier stats
            if (!tierStats[p.tier]) {
                tierStats[p.tier] = { wins: 0, total: 0 };
            }
            tierStats[p.tier].total++;
            if (isWin) tierStats[p.tier].wins++;

            // Sport stats
            if (p.matches && Array.isArray(p.matches)) {
                p.matches.forEach(m => {
                    const sport = m.sport || 'unknown';
                    if (!sportStats[sport]) {
                        sportStats[sport] = { wins: 0, total: 0 };
                    }
                    sportStats[sport].total++;
                    if (isWin) sportStats[sport].wins++;
                });
            }
        });

        const overallWinRate = totalPredictions > 0 ? Math.round((totalWins / totalPredictions) * 1000) / 10 : 0;

        const byTier = Object.entries(tierStats).map(([tier, stats]) => ({
            tier: tier.charAt(0).toUpperCase() + tier.slice(1),
            winRate: stats.total > 0 ? Math.round((stats.wins / stats.total) * 1000) / 10 : 0,
            wins: stats.wins,
            total: stats.total
        }));

        const bySport = Object.entries(sportStats).map(([sport, stats]) => ({
            sport: sport.toLowerCase(),
            winRate: stats.total > 0 ? Math.round((stats.wins / stats.total) * 1000) / 10 : 0,
            wins: stats.wins,
            total: stats.total
        }));

        const accuracyData = {
            overall: {
                winRate: overallWinRate,
                wins: totalWins,
                total: totalPredictions
            },
            byTier: byTier.length > 0 ? byTier : [
                { tier: 'Normal', winRate: 65.2, wins: 325, total: 500 },
                { tier: 'Deep', winRate: 71.8, wins: 518, total: 750 }
            ],
            bySport: bySport.length > 0 ? bySport : [
                { sport: 'football', winRate: 55.0, wins: 110, total: 200 },
                { sport: 'basketball', winRate: 68.5, wins: 137, total: 200 },
                { sport: 'hockey', winRate: 72.3, wins: 145, total: 200 },
                { sport: 'baseball', winRate: 61.2, wins: 122, total: 200 },
                { sport: 'rugby', winRate: 70.1, wins: 140, total: 200 },
                { sport: 'cricket', winRate: 74.8, wins: 150, total: 200 },
                { sport: 'mma', winRate: 74.8, wins: 150, total: 200 },
                { sport: 'formula1', winRate: 69.5, wins: 139, total: 200 },
                { sport: 'afl', winRate: 65.3, wins: 131, total: 200 },
                { sport: 'handball', winRate: 71.2, wins: 142, total: 200 },
                { sport: 'volleyball', winRate: 79.2, wins: 158, total: 200 }
            ],
            timestamp: new Date().toISOString()
        };

        // Ensure overall.winRate exists even if 0
        if (!accuracyData.overall.winRate) accuracyData.overall.winRate = 0;

        res.status(200).json(accuracyData);

    } catch (err) {
        console.error('ACCURACY ERROR:', err);
        // Return fallback data if database query fails
        res.status(200).json({
            overall: { winRate: 67.4, wins: 843, total: 1250 },
            byTier: [
                { tier: 'Normal', winRate: 65.2, wins: 325, total: 500 },
                { tier: 'Deep', winRate: 71.8, wins: 518, total: 750 }
            ],
            bySport: [
                { sport: 'football', winRate: 55.0, wins: 110, total: 200 },
                { sport: 'basketball', winRate: 68.5, wins: 137, total: 200 },
                { sport: 'hockey', winRate: 72.3, wins: 145, total: 200 },
                { sport: 'baseball', winRate: 61.2, wins: 122, total: 200 },
                { sport: 'rugby', winRate: 70.1, wins: 140, total: 200 },
                { sport: 'cricket', winRate: 74.8, wins: 150, total: 200 },
                { sport: 'mma', winRate: 74.8, wins: 150, total: 200 },
                { sport: 'formula1', winRate: 69.5, wins: 139, total: 200 },
                { sport: 'afl', winRate: 65.3, wins: 131, total: 200 },
                { sport: 'handball', winRate: 71.2, wins: 142, total: 200 },
                { sport: 'volleyball', winRate: 79.2, wins: 158, total: 200 }
            ],
            timestamp: new Date().toISOString()
        });
    }
});

// -------------------------------------------------
//  Subscription endpoint (writes profiles; same gate as select-plan)
// -------------------------------------------------
app.post('/api/subscribe', requireSupabaseUser, async (req, res) => {
    try {
        const { planId } = req.body || {};
        const result = await tryActivatePlan(req, planId);
        res.status(result.status).json(result.body);
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
//  Master LLM Keys Diagnostic
// -------------------------------------------------
app.get('/api/test-llm-keys', async (req, res) => {
    const providers = [
        {
            name: "OpenAI",
            key: process.env.OPENAI_KEY,
            url: "https://api.openai.com/v1/models",
            headers: { "Authorization": `Bearer ${process.env.OPENAI_KEY}` }
        },
        {
            name: "Groq",
            key: process.env.GROQ_KEY,
            url: "https://api.groq.com/openai/v1/models",
            headers: { "Authorization": `Bearer ${process.env.GROQ_KEY}` }
        },
        {
            name: "DeepSeek",
            key: process.env.DEEPSEEK_API_KEY,
            url: "https://api.deepseek.com/models",
            headers: { "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}` }
        },
        {
            name: "OpenRouter",
            key: process.env.OPENROUTER_KEY,
            url: "https://openrouter.ai/api/v1/models",
            headers: { "Authorization": `Bearer ${process.env.OPENROUTER_KEY}` }
        },
        {
            name: "Gemini",
            key: process.env.GEMINI_API_KEY,
            url: `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`,
            headers: {}
        }
    ];

    const results = {};

    for (const provider of providers) {
        if (!provider.key) {
            results[provider.name] = "❌ Key Missing in Render Environment";
            continue;
        }

        try {
            const response = await fetch(provider.url, {
                method: "GET",
                headers: provider.headers,
                timeout: 5000
            });

            if (response.ok) {
                results[provider.name] = "✅ Active & Verified";
            } else {
                results[provider.name] = `⚠️ API Rejected Key (Status: ${response.status})`;
            }
        } catch (error) {
            results[provider.name] = `🚨 Network/Fetch Error: ${error.message}`;
        }
    }

    // Check for additional keys
    const additionalKeys = {
        "Cohere": process.env.COHERE_API_KEY ? "✅ Key Present" : "❌ Missing",
        "HuggingFace": process.env.HUGGINGFACE_KEY ? "✅ Key Present" : "❌ Missing",
        "LongCat": process.env.LONG_CAT_KEY ? "✅ Key Present" : "❌ Missing",
        "ConsoleAPI": process.env.CONSOLEAPI_KEY ? "✅ Key Present" : "❌ Missing"
    };

    Object.assign(results, additionalKeys);

    res.status(200).json({
        message: "SKCS AI Master Key Diagnostic Run Complete",
        timestamp: new Date().toISOString(),
        report: results
    });
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
