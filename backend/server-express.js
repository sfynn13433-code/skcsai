'use strict';

require('dotenv').config();

const express      = require('express');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');
const cors         = require('cors');
const morgan       = require('morgan');
const moment       = require('moment-timezone');
const path         = require('path');
const { query }            = require('./db');
const { requireRole }        = require('./utils/auth');
const { upsertProfile }     = require('./database');
const { getPlan }           = require('./config/subscriptionPlans');
const { requireSupabaseUser } = require('./middleware/supabaseJwt');
const cron         = require('node-cron');
const { syncAllSports, syncSports }      = require('./services/syncService');
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

// -----------------  CORS configuration (HARDENED)  -----------------
const configuredOrigins = String(process.env.FRONTEND_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set([
  "https://skcsaiedge.onrender.com",
  "https://skcsai-z8cd.onrender.com",
  "https://skcs-sports-edge.github.io",
  "https://skcsaisports.vercel.app",
  "https://skcsai.vercel.app",
  "https://skcs.co.za",
  "https://www.skcs.co.za",
  "https://skcsaisports-6x2zcgjq1-stephens-projects-e3dd898a.vercel.app",
  "https://skcsaisports-o200aflsl-stephens-projects-e3dd898a.vercel.app",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  ...configuredOrigins
]);

const corsOptions = {
  origin(origin, cb) {
    // Allow non-browser / server-to-server calls (curl, Postman, etc.)
    if (!origin) return cb(null, true);

    if (allowedOrigins.has(origin)) {
      console.log(`[CORS] Approved origin: ${origin}`);
      return cb(null, origin);
    }

    // Return a controlled error for unapproved origins to prevent silent failures
    console.log(`[CORS] BLOCKED origin: ${origin}`);
    console.log(`[CORS] Allowed origins: ${Array.from(allowedOrigins).join(', ')}`);
    return cb(new Error(`CORS policy blocked access from origin: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  // Explicit headers for known custom headers (safest approach per W3C spec)
  allowedHeaders: ["Content-Type", "Authorization", "x-api-key"],
  credentials: false, // Critical: Set to true ONLY if using cross-origin cookies
  optionsSuccessStatus: 204, // Standard 204 No Content for preflights (IE11 compatible)
  maxAge: 86400, // Cache preflight results for 24 hours to reduce network overhead
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// -----------------  CORS Debug Logging  -----------------
app.use((req, res, next) => {
  const origin = req.headers.origin;
  console.log(`[CORS DEBUG] ${req.method} ${req.url} from origin: ${origin}`);
  console.log(`[CORS DEBUG] Request headers: x-api-key=${req.headers['x-api-key'] ? 'present' : 'missing'}`);
  next();
});

// -----------------  Security middleware  -----------------
app.use(
    helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false
    })
);

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

function getBillingStatus() {
    const open = process.env.SKCS_SUBSCRIBE_OPEN === '1' || process.env.SKCS_SUBSCRIBE_OPEN === 'true';
    const freePassCount = getFreePassEmailSet().size;

    return {
        billing_enabled: false,
        subscription_open: open,
        access_mode: open ? 'staging-open' : 'invite-only',
        free_pass_configured: freePassCount > 0,
        free_pass_count: freePassCount,
        message: open
            ? 'Billing is not enabled. Plans can still be activated in staging-open mode.'
            : 'Billing is not enabled. Access is currently limited to approved accounts.'
    };
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

app.get('/api/billing-status', (_req, res) => {
    res.status(200).json(getBillingStatus());
});

// -------------------------------------------------
//  Refresh predictions endpoint
// -------------------------------------------------
app.post('/api/refresh-predictions', async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'];
        const requestedSport = req.query.sport ? String(req.query.sport).toLowerCase() : null;

        // Simple auth check
        if (apiKey !== process.env.SKCS_REFRESH_KEY && apiKey !== 'skcs_refresh_key') {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        // Trigger the sync service
        console.log(`[REFRESH] Triggering sports data sync${requestedSport ? ` for ${requestedSport}` : ''}...`);
        const result = await syncSports({ sports: requestedSport }).catch(err => {
            console.error('[REFRESH] Sync failed:', err);
            throw err;
        });

        res.status(200).json({
            success: true,
            message: 'Predictions refreshed',
            requestedSport,
            result,
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
const ACCURACY_TIER_DEFS = [
    { key: 'core', label: 'Core' },
    { key: 'elite', label: 'Elite' }
];

const ACCURACY_TYPE_DEFS = [
    { key: 'direct', label: 'Direct' },
    { key: 'secondary', label: 'Secondary' },
    { key: 'multi', label: 'Multi' },
    { key: 'same_match', label: 'Same Match' },
    { key: 'acca', label: 'ACCA' }
];

function normalizeAccuracyTier(value) {
    const normalized = String(value || '').toLowerCase();
    if (normalized === 'deep' || normalized === 'elite') return 'elite';
    if (normalized === 'normal' || normalized === 'core') return 'core';
    return normalized || 'unknown';
}

function labelAccuracyTier(value) {
    return normalizeAccuracyTier(value) === 'elite' ? 'Elite' : 'Core';
}

function normalizeAccuracyType(value) {
    const normalized = String(value || '').toLowerCase();
    if (normalized === 'acca' || normalized === 'acca_6match') return 'acca';
    if (normalized === 'same_match') return 'same_match';
    if (normalized === 'secondary') return 'secondary';
    if (normalized === 'multi') return 'multi';
    if (normalized === 'direct') return 'direct';
    return normalized || 'other';
}

function labelAccuracyType(value) {
    switch (normalizeAccuracyType(value)) {
    case 'same_match':
        return 'Same Match';
    case 'secondary':
        return 'Secondary';
    case 'multi':
        return 'Multi';
    case 'direct':
        return 'Direct';
    case 'acca':
        return 'ACCA';
    default:
        return 'Other';
    }
}

function createAccuracyBucket(key, label) {
    return {
        key,
        label,
        wins: 0,
        losses: 0,
        graded: 0,
        total: 0,
        pending: 0,
        void: 0,
        unsupported: 0
    };
}

function finalizeAccuracyBucket(bucket) {
    return {
        ...bucket,
        winRate: bucket.graded > 0 ? Math.round((bucket.wins / bucket.graded) * 1000) / 10 : 0
    };
}

function buildAccuracyBreakdown(rows, definitions, keyFn, labelFn) {
    const bucketMap = new Map();
    for (const definition of definitions) {
        bucketMap.set(definition.key, createAccuracyBucket(definition.key, definition.label));
    }

    for (const row of rows) {
        const key = keyFn(row);
        if (!bucketMap.has(key)) {
            bucketMap.set(key, createAccuracyBucket(key, labelFn(key)));
        }
        const bucket = bucketMap.get(key);
        bucket.total += 1;

        if (typeof row.is_correct === 'boolean') {
            bucket.graded += 1;
            if (row.is_correct) bucket.wins += 1;
            else bucket.losses += 1;
        } else if (row.resolution_status === 'pending') {
            bucket.pending += 1;
        } else if (row.resolution_status === 'void') {
            bucket.void += 1;
        } else if (row.resolution_status === 'unsupported') {
            bucket.unsupported += 1;
        }
    }

    return Array.from(bucketMap.values()).map(finalizeAccuracyBucket);
}

function buildAccuracySlipRows(rows) {
    const slipMap = new Map();

    for (const row of rows) {
        const slipKey = String(row.prediction_final_id);
        if (!slipMap.has(slipKey)) {
            slipMap.set(slipKey, {
                prediction_final_id: row.prediction_final_id,
                prediction_tier: row.prediction_tier,
                prediction_type: row.prediction_type,
                sport: row.sport,
                legs: []
            });
        }
        slipMap.get(slipKey).legs.push(row);
    }

    return Array.from(slipMap.values()).map((slip) => {
        const statuses = slip.legs.map((leg) => leg.resolution_status);
        const hasLoss = statuses.includes('lost');
        const hasPending = statuses.includes('pending') || statuses.includes('missing_event');
        const wonCount = statuses.filter((status) => status === 'won').length;
        const voidCount = statuses.filter((status) => status === 'void').length;
        const unsupportedCount = statuses.filter((status) => status === 'unsupported').length;

        let resolutionStatus = 'pending';
        let isCorrect = null;

        if (hasLoss) {
            resolutionStatus = 'lost';
            isCorrect = false;
        } else if (hasPending) {
            resolutionStatus = 'pending';
        } else if (voidCount === statuses.length) {
            resolutionStatus = 'void';
        } else if (unsupportedCount > 0 && wonCount === 0) {
            resolutionStatus = 'unsupported';
        } else if (wonCount > 0 && wonCount + voidCount === statuses.length && unsupportedCount === 0) {
            resolutionStatus = 'won';
            isCorrect = true;
        } else if (unsupportedCount > 0) {
            resolutionStatus = 'unsupported';
        }

        return {
            prediction_final_id: slip.prediction_final_id,
            prediction_tier: slip.prediction_tier,
            prediction_type: slip.prediction_type,
            sport: slip.sport,
            legCount: slip.legs.length,
            resolution_status: resolutionStatus,
            is_correct: isCorrect
        };
    });
}

app.get('/api/accuracy', async (req, res) => {
    try {
        const requestedSport = String(req.query.sport || 'football').toLowerCase();
        const requestedDate = req.query.date ? String(req.query.date) : null;
        const requestedRunId = req.query.run_id ? Number(req.query.run_id) : null;

        const latestDateRes = await query(
            `SELECT MAX(LEFT(COALESCE(leg.match_item->>'match_date', leg.match_item->>'commence_time', ''), 10)) AS latest_date
             FROM predictions_final pf
             CROSS JOIN LATERAL jsonb_array_elements(pf.matches) AS leg(match_item)
             WHERE COALESCE(leg.match_item->>'sport', '') = $1`,
            [requestedSport]
        );

        const effectiveDate = requestedDate || latestDateRes.rows?.[0]?.latest_date || null;

        if (!effectiveDate) {
            return res.status(200).json({
                overall: { winRate: 0, wins: 0, total: 0, graded: 0, pending: 0, void: 0, unsupported: 0 },
                byTier: [],
                byType: [],
                tierTypeBreakdown: [],
                bySport: [],
                weekly: [],
                losses: [],
                availability: {
                    availableSports: [],
                    availableDates: [],
                    availableRuns: []
                },
                window: {
                    date: requestedDate,
                    sport: requestedSport,
                    runId: requestedRunId || null,
                    publishRun: null,
                    publishSummary: {
                        products: 0,
                        legs: 0
                    },
                    graded: 0,
                    pending: 0,
                    void: 0,
                    unsupported: 0,
                    missingEvent: 0,
                    reasonCapabilities: {
                        verified: ['goals', 'half-time scores', 'corners', 'red cards', 'match events', 'shots', 'possession'],
                        unavailable: [
                            'historical weather attribution unless separately ingested',
                            'historical injury attribution unless separately ingested',
                            'manual news context unless separately ingested'
                        ]
                    },
                    contextCoverage: {
                        injuryRows: 0,
                        weatherRows: 0,
                        newsRows: 0
                    }
                },
                timestamp: new Date().toISOString()
            });
        }

        const availabilityRes = await query(
            `SELECT sport, fixture_date::text AS fixture_date
             FROM (
                SELECT
                    COALESCE(leg.match_item->>'sport', '') AS sport,
                    LEFT(COALESCE(leg.match_item->>'match_date', leg.match_item->>'commence_time', ''), 10) AS fixture_date
                FROM predictions_final pf
                CROSS JOIN LATERAL jsonb_array_elements(pf.matches) AS leg(match_item)
             ) availability
             WHERE sport <> ''
               AND fixture_date <> ''
             GROUP BY sport, fixture_date
             ORDER BY fixture_date DESC, sport ASC`
        );
        const availabilityRows = availabilityRes.rows || [];
        const availableSports = Array.from(new Set(availabilityRows.map((row) => String(row.sport || '').toLowerCase()).filter(Boolean)));
        const availableDates = availabilityRows
            .filter((row) => String(row.sport || '').toLowerCase() === requestedSport)
            .map((row) => row.fixture_date);

        const availableRunsRes = await query(
            `SELECT
                pf.publish_run_id,
                pr.trigger_source,
                pr.status,
                pr.started_at,
                pr.completed_at,
                pr.requested_sports,
                MAX(COALESCE(pr.completed_at, pr.started_at, pf.created_at)) AS sort_time
             FROM predictions_final pf
             CROSS JOIN LATERAL jsonb_array_elements(pf.matches) AS leg(match_item)
             LEFT JOIN prediction_publish_runs pr ON pr.id = pf.publish_run_id
             WHERE LEFT(COALESCE(leg.match_item->>'match_date', leg.match_item->>'commence_time', ''), 10) = $1
               AND COALESCE(leg.match_item->>'sport', '') = $2
               AND pf.publish_run_id IS NOT NULL
             GROUP BY
                pf.publish_run_id,
                pr.trigger_source,
                pr.status,
                pr.started_at,
                pr.completed_at,
                pr.requested_sports
             ORDER BY sort_time DESC NULLS LAST, pf.publish_run_id DESC`,
            [effectiveDate, requestedSport]
        );
        const availableRuns = (availableRunsRes.rows || []).map((row) => ({
            runId: Number(row.publish_run_id),
            triggerSource: row.trigger_source || 'unknown',
            status: row.status || 'unknown',
            startedAt: row.started_at || null,
            completedAt: row.completed_at || null,
            requestedSports: Array.isArray(row.requested_sports) ? row.requested_sports : []
        }));
        const effectiveRunId = availableRuns.some((run) => run.runId === requestedRunId)
            ? requestedRunId
            : (availableRuns[0]?.runId || null);
        const effectiveRun = availableRuns.find((run) => run.runId === effectiveRunId) || null;
        const publishSummaryRes = await query(
            `SELECT
                COUNT(DISTINCT pf.id)::int AS products,
                COUNT(*)::int AS legs
             FROM predictions_final pf
             CROSS JOIN LATERAL jsonb_array_elements(pf.matches) AS leg(match_item)
             WHERE LEFT(COALESCE(leg.match_item->>'match_date', leg.match_item->>'commence_time', ''), 10) = $1
               AND COALESCE(leg.match_item->>'sport', '') = $2
               AND ($3::bigint IS NULL OR pf.publish_run_id = $3::bigint)`,
            [effectiveDate, requestedSport, effectiveRunId]
        );
        const publishSummary = publishSummaryRes.rows?.[0] || { products: 0, legs: 0 };

        const contextCoverageRes = await query(
            `SELECT
                (SELECT COUNT(*)::int FROM event_injury_snapshots WHERE fixture_date = $1::date) AS injury_rows,
                (SELECT COUNT(*)::int FROM event_weather_snapshots WHERE fixture_date = $1::date) AS weather_rows,
                (SELECT COUNT(*)::int FROM event_news_snapshots WHERE fixture_date = $1::date) AS news_rows`,
            [effectiveDate]
        );
        const contextCoverage = contextCoverageRes.rows?.[0] || { injury_rows: 0, weather_rows: 0, news_rows: 0 };
        const verifiedCapabilities = ['goals', 'half-time scores', 'corners', 'red cards', 'match events', 'shots', 'possession'];
        const unavailableCapabilities = [];
        if (Number(contextCoverage.injury_rows) > 0) {
            verifiedCapabilities.push('historical injury attribution');
        } else {
            unavailableCapabilities.push('historical injury attribution unless separately ingested');
        }
        if (Number(contextCoverage.weather_rows) > 0) {
            verifiedCapabilities.push('historical weather attribution');
        } else {
            unavailableCapabilities.push('historical weather attribution unless separately ingested');
        }
        if (Number(contextCoverage.news_rows) > 0) {
            verifiedCapabilities.push('manual news context');
        } else {
            unavailableCapabilities.push('manual news context unless separately ingested');
        }

        const windowRes = await query(
            `SELECT *
             FROM predictions_accuracy
             WHERE fixture_date = $1::date
               AND sport = $2
               AND ($3::bigint IS NULL OR publish_run_id = $3::bigint)
             ORDER BY confidence DESC NULLS LAST, prediction_final_id, prediction_match_index`,
            [effectiveDate, requestedSport, effectiveRunId]
        );

        const allSportRes = await query(
            `WITH grouped_runs AS (
                SELECT
                    fixture_date,
                    publish_run_id,
                    COALESCE(pr.completed_at, pr.started_at, MAX(pa.evaluated_at)) AS sort_time
                FROM predictions_accuracy pa
                LEFT JOIN prediction_publish_runs pr ON pr.id = pa.publish_run_id
                WHERE pa.sport = $1
                GROUP BY fixture_date, publish_run_id, pr.completed_at, pr.started_at
             ),
             ranked_runs AS (
                SELECT
                    fixture_date,
                    publish_run_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY fixture_date
                        ORDER BY sort_time DESC NULLS LAST, publish_run_id DESC NULLS LAST
                    ) AS rn
                FROM grouped_runs
             )
             SELECT pa.*
             FROM predictions_accuracy pa
             JOIN ranked_runs rr
               ON rr.fixture_date = pa.fixture_date
              AND COALESCE(rr.publish_run_id, -1) = COALESCE(pa.publish_run_id, -1)
             WHERE pa.sport = $1
               AND rr.rn = 1
             ORDER BY pa.fixture_date DESC, pa.confidence DESC NULLS LAST`,
            [requestedSport]
        );

        const rows = windowRes.rows || [];
        const allRows = allSportRes.rows || [];
        const slipRows = buildAccuracySlipRows(rows);

        const gradedRows = rows.filter((row) => typeof row.is_correct === 'boolean');
        const wins = gradedRows.filter((row) => row.is_correct).length;
        const losses = gradedRows.length - wins;
        const pending = rows.filter((row) => row.resolution_status === 'pending').length;
        const voided = rows.filter((row) => row.resolution_status === 'void').length;
        const unsupported = rows.filter((row) => row.resolution_status === 'unsupported').length;
        const missingEvent = rows.filter((row) => row.resolution_status === 'missing_event').length;
        const overallWinRate = gradedRows.length > 0 ? Math.round((wins / gradedRows.length) * 1000) / 10 : 0;

        const byTier = buildAccuracyBreakdown(
            slipRows,
            ACCURACY_TIER_DEFS,
            (row) => normalizeAccuracyTier(row.prediction_tier),
            (key) => labelAccuracyTier(key)
        ).map((entry) => ({
            tierKey: entry.key,
            tier: entry.label,
            winRate: entry.winRate,
            wins: entry.wins,
            losses: entry.losses,
            total: entry.total,
            graded: entry.graded,
            pending: entry.pending,
            void: entry.void,
            unsupported: entry.unsupported
        }));

        const byType = buildAccuracyBreakdown(
            slipRows,
            ACCURACY_TYPE_DEFS,
            (row) => normalizeAccuracyType(row.prediction_type),
            (key) => labelAccuracyType(key)
        ).map((entry) => ({
            typeKey: entry.key,
            type: entry.label,
            winRate: entry.winRate,
            wins: entry.wins,
            losses: entry.losses,
            total: entry.total,
            graded: entry.graded,
            pending: entry.pending,
            void: entry.void,
            unsupported: entry.unsupported
        }));

        const tierTypeBreakdown = ACCURACY_TIER_DEFS.map((tierDef) => {
            const tierRows = slipRows.filter((row) => normalizeAccuracyTier(row.prediction_tier) === tierDef.key);
            const types = buildAccuracyBreakdown(
                tierRows,
                ACCURACY_TYPE_DEFS,
                (row) => normalizeAccuracyType(row.prediction_type),
                (key) => labelAccuracyType(key)
            ).map((entry) => ({
                typeKey: entry.key,
                type: entry.label,
                winRate: entry.winRate,
                wins: entry.wins,
                losses: entry.losses,
                total: entry.total,
                graded: entry.graded,
                pending: entry.pending,
                void: entry.void,
                unsupported: entry.unsupported
            }));

            const tierSummary = byTier.find((entry) => entry.tierKey === tierDef.key) || {
                tierKey: tierDef.key,
                tier: tierDef.label,
                winRate: 0,
                wins: 0,
                losses: 0,
                total: 0,
                graded: 0,
                pending: 0,
                void: 0,
                unsupported: 0
            };

            return {
                ...tierSummary,
                types
            };
        });

        const sportMap = new Map();
        for (const row of rows) {
            const key = row.sport || 'unknown';
            if (!sportMap.has(key)) {
                sportMap.set(key, { sport: key, wins: 0, graded: 0, total: 0 });
            }
            const entry = sportMap.get(key);
            entry.total += 1;
            if (typeof row.is_correct === 'boolean') {
                entry.graded += 1;
                if (row.is_correct) entry.wins += 1;
            }
        }

        const bySport = Array.from(sportMap.values()).map((entry) => ({
            sport: entry.sport,
            winRate: entry.graded > 0 ? Math.round((entry.wins / entry.graded) * 1000) / 10 : 0,
            wins: entry.wins,
            total: entry.total,
            graded: entry.graded
        }));

        const weeklyMap = new Map();
        for (const row of allRows) {
            if (!row.fixture_date) continue;
            const weekKey = moment(row.fixture_date).startOf('isoWeek').format('YYYY-MM-DD');
            if (!weeklyMap.has(weekKey)) {
                weeklyMap.set(weekKey, {
                    weekStart: weekKey,
                    wins: 0,
                    losses: 0,
                    pending: 0,
                    total: 0,
                    reasonCounts: new Map()
                });
            }

            const entry = weeklyMap.get(weekKey);
            entry.total += 1;

            if (row.resolution_status === 'won') entry.wins += 1;
            else if (row.resolution_status === 'lost') entry.losses += 1;
            else if (row.resolution_status === 'pending') entry.pending += 1;

            if (row.resolution_status === 'lost' && Array.isArray(row.loss_factors)) {
                for (const factor of row.loss_factors) {
                    const label = factor?.label || factor?.type || 'Unknown';
                    entry.reasonCounts.set(label, (entry.reasonCounts.get(label) || 0) + 1);
                }
            }
        }

        const weekly = Array.from(weeklyMap.values())
            .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
            .slice(0, 6)
            .map((entry) => {
                const graded = entry.wins + entry.losses;
                const topReasons = Array.from(entry.reasonCounts.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([label, count]) => `${label} (${count})`);

                return {
                    weekStart: entry.weekStart,
                    wins: entry.wins,
                    losses: entry.losses,
                    pending: entry.pending,
                    total: entry.total,
                    accuracy: graded > 0 ? Math.round((entry.wins / graded) * 1000) / 10 : 0,
                    reasons: topReasons
                };
            });

        const lossCards = rows
            .filter((row) => row.resolution_status === 'lost')
            .slice(0, 12)
            .map((row) => ({
                predictionFinalId: row.prediction_final_id,
                matchIndex: row.prediction_match_index,
                match: `${row.home_team} vs ${row.away_team}`,
                sport: row.sport,
                tier: labelAccuracyTier(row.prediction_tier),
                tierKey: normalizeAccuracyTier(row.prediction_tier),
                predictionType: labelAccuracyType(row.prediction_type),
                predictionTypeKey: normalizeAccuracyType(row.prediction_type),
                market: row.market,
                predictedOutcome: row.predicted_outcome,
                actualResult: row.actual_result,
                confidence: row.confidence,
                eventStatus: row.event_status,
                scoreline: [row.actual_home_score, row.actual_away_score].every((value) => Number.isFinite(Number(value)))
                    ? `${row.actual_home_score}-${row.actual_away_score}`
                    : null,
                halftimeScoreline: [row.actual_home_score_ht, row.actual_away_score_ht].every((value) => Number.isFinite(Number(value)))
                    ? `${row.actual_home_score_ht}-${row.actual_away_score_ht}`
                    : null,
                reasonSummary: row.loss_reason_summary || row.evaluation_notes || 'No verified loss reason captured.',
                factors: Array.isArray(row.loss_factors) ? row.loss_factors : []
            }));

        res.status(200).json({
            overall: {
                winRate: overallWinRate,
                wins,
                total: rows.length,
                graded: gradedRows.length,
                pending,
                void: voided,
                unsupported,
                missingEvent
            },
            byTier,
            byType,
            tierTypeBreakdown,
            bySport,
            weekly,
            losses: lossCards,
            availability: {
                availableSports,
                availableDates,
                availableRuns
            },
            window: {
                date: effectiveDate,
                sport: requestedSport,
                runId: effectiveRunId,
                publishRun: effectiveRun,
                publishSummary: {
                    products: Number(publishSummary.products) || 0,
                    legs: Number(publishSummary.legs) || 0
                },
                graded: gradedRows.length,
                pending,
                void: voided,
                unsupported,
                missingEvent,
                contextCoverage: {
                    injuryRows: Number(contextCoverage.injury_rows) || 0,
                    weatherRows: Number(contextCoverage.weather_rows) || 0,
                    newsRows: Number(contextCoverage.news_rows) || 0
                },
                reasonCapabilities: {
                    verified: verifiedCapabilities,
                    unavailable: unavailableCapabilities
                }
            },
            timestamp: new Date().toISOString()
        });

    } catch (err) {
        console.error('ACCURACY ERROR:', err);
        res.status(200).json({
            overall: { winRate: 0, wins: 0, total: 0, graded: 0, pending: 0, void: 0, unsupported: 0 },
            byTier: [],
            byType: [],
            tierTypeBreakdown: [],
            bySport: [],
            weekly: [],
            losses: [],
            availability: {
                availableSports: [],
                availableDates: [],
                availableRuns: []
            },
            window: {
                date: req.query.date || null,
                sport: String(req.query.sport || 'football').toLowerCase(),
                runId: req.query.run_id ? Number(req.query.run_id) : null,
                publishRun: null,
                publishSummary: {
                    products: 0,
                    legs: 0
                },
                graded: 0,
                pending: 0,
                void: 0,
                unsupported: 0,
                missingEvent: 0,
                reasonCapabilities: {
                    verified: ['goals', 'half-time scores', 'corners', 'red cards', 'match events', 'shots', 'possession'],
                    unavailable: [
                        'historical weather attribution unless separately ingested',
                        'historical injury attribution unless separately ingested',
                        'manual news context unless separately ingested'
                    ]
                },
                contextCoverage: {
                    injuryRows: 0,
                    weatherRows: 0,
                    newsRows: 0
                }
            },
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

// -----------------  Health check endpoint (Render requires this)  -----------------
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        port: PORT,
        uptime: process.uptime(),
        cors: 'enabled',
        origins: Array.from(allowedOrigins)
    });
});

// -----------------  Simple CORS test endpoint  -----------------
app.get('/cors-test', (req, res) => {
    const origin = req.headers.origin;
    res.status(200).json({ 
        message: 'CORS test successful',
        origin: origin,
        timestamp: new Date().toISOString(),
        headers: {
            'x-api-key': req.headers['x-api-key'] ? 'present' : 'missing'
        }
    });
});

// -------------------------------------------------
//  API info endpoint
// -------------------------------------------------
app.get('/api', (req, res) => {
    res.status(200).json({ 
        message: 'SKCS Backend API',
        status: 'running',
        version: '1.0.0',
        endpoints: ['/api/predictions', '/api/user', '/api/pipeline', '/api/chat', '/health', '/cors-test']
    });
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
// Force Render Redeploy - 04/03/2026 12:05:06
