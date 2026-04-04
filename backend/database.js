require('dotenv').config();

const { Pool } = require('pg');
const config = require('./config');
console.log('✅ LOADING database.js (PostgreSQL version)');

const databaseUrl = process.env.DATABASE_URL;
const hasDatabaseUrl = typeof databaseUrl === 'string' && databaseUrl.trim().length > 0;

function shouldUseSsl(connectionString) {
    try {
        const url = new URL(connectionString);
        const host = (url.hostname || '').toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1') return false;
        return true;
    } catch {
        return true;
    }
}

function summarizeDatabaseUrl(connectionString) {
    try {
        const url = new URL(connectionString);
        return {
            protocol: url.protocol,
            host: url.hostname || null,
            port: url.port || null,
            database: url.pathname ? url.pathname.replace(/^\//, '') : null,
            username: url.username || null,
            sslmode: url.searchParams.get('sslmode') || null,
            pgbouncer: url.searchParams.get('pgbouncer') || null
        };
    } catch (error) {
        return {
            parse_error: error?.message || 'Unable to parse DATABASE_URL'
        };
    }
}

if (hasDatabaseUrl) {
    console.log('🔎 DATABASE_URL runtime summary:', summarizeDatabaseUrl(databaseUrl));
}

// Create a connection pool to PostgreSQL only when configured.
// This keeps local/dev and Render boot clean when DATABASE_URL is not set yet.
const pool = hasDatabaseUrl
    ? new Pool({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 10_000,
        idleTimeoutMillis: 30_000,
        max: 10,
        ssl: shouldUseSsl(databaseUrl) ? { rejectUnauthorized: false } : false
    })
    : null;

if (pool) {
    pool.on('error', (err) => {
        console.error('❌ PostgreSQL pool error:', {
            message: err?.message,
            code: err?.code,
            detail: err?.detail,
            hint: err?.hint
        });
    });

    (async () => {
        try {
            const res = await pool.query('SELECT 1 AS ok');
            console.log('✅ Supabase PostgreSQL connection test OK:', res.rows?.[0]?.ok);
        } catch (err) {
            console.error('❌ Supabase PostgreSQL connection test FAILED:', {
                message: err?.message,
                code: err?.code,
                detail: err?.detail,
                hint: err?.hint
            });
            if (err?.code === '28P01') {
                console.error('🚨 DATABASE AUTH CHECK: Render DATABASE_URL is reaching Supabase, but authentication failed. Verify the Render Environment value, reset the Supabase DB password if needed, and URL-encode any special characters in the password before pasting it into DATABASE_URL.');
            }
        }
    })();
}

let hasLoggedDbDisabled = false;
let hasInitializedTables = false;

async function ensureDbInitialized() {
    if (!pool) {
        if (!hasLoggedDbDisabled) {
            hasLoggedDbDisabled = true;
            console.warn('⚠️ DATABASE_URL not set. Database-backed routes will return empty results.');
        }
        return false;
    }

    if (hasInitializedTables) return true;

    try {
        const client = await pool.connect();
        client.release();
        await initializeTables();
        hasInitializedTables = true;
        console.log('Connected to PostgreSQL.');
        return true;
    } catch (err) {
        console.error('Error connecting to PostgreSQL:', err.stack || err);
        return false;
    }
}

// Initialize tables if they don't exist
async function initializeTables() {
    if (!pool) return;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Leagues table
        await client.query(`CREATE TABLE IF NOT EXISTS leagues (
            id SERIAL PRIMARY KEY,
            sport TEXT NOT NULL,
            name TEXT NOT NULL,
            api_source TEXT,
            api_league_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // Teams table
        await client.query(`CREATE TABLE IF NOT EXISTS teams (
            id SERIAL PRIMARY KEY,
            league_id INTEGER REFERENCES leagues(id),
            name TEXT NOT NULL,
            short_name TEXT,
            country TEXT,
            venue TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // Matches table
        await client.query(`CREATE TABLE IF NOT EXISTS matches (
            id SERIAL PRIMARY KEY,
            league_id INTEGER REFERENCES leagues(id),
            home_team_id INTEGER REFERENCES teams(id),
            away_team_id INTEGER REFERENCES teams(id),
            match_date TIMESTAMP,
            status TEXT,
            home_score INTEGER,
            away_score INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // Team stats table
        await client.query(`CREATE TABLE IF NOT EXISTS team_stats (
            id SERIAL PRIMARY KEY,
            team_id INTEGER REFERENCES teams(id),
            season TEXT,
            matches_played INTEGER,
            wins INTEGER,
            draws INTEGER,
            losses INTEGER,
            goals_for INTEGER,
            goals_against INTEGER,
            points INTEGER,
            form_rating REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // Injuries table
        await client.query(`CREATE TABLE IF NOT EXISTS injuries (
            id SERIAL PRIMARY KEY,
            team_id INTEGER REFERENCES teams(id),
            player_name TEXT,
            injury_type TEXT,
            severity TEXT,
            status TEXT,
            expected_return DATE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // News mentions table
        await client.query(`CREATE TABLE IF NOT EXISTS news_mentions (
            id SERIAL PRIMARY KEY,
            team_id INTEGER REFERENCES teams(id),
            source TEXT,
            title TEXT,
            content TEXT,
            sentiment_score REAL,
            relevance_score REAL,
            published_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // Predictions Raw
        await client.query(`CREATE TABLE IF NOT EXISTS predictions_raw (
            id BIGSERIAL PRIMARY KEY,
            match_id TEXT NOT NULL,
            sport TEXT NOT NULL,
            market TEXT NOT NULL,
            prediction TEXT NOT NULL,
            confidence REAL NOT NULL,
            volatility TEXT NOT NULL,
            odds REAL,
            metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);

        // Predictions Filtered
        await client.query(`CREATE TABLE IF NOT EXISTS predictions_filtered (
            id BIGSERIAL PRIMARY KEY,
            raw_id BIGINT NOT NULL REFERENCES predictions_raw(id) ON DELETE CASCADE,
            tier TEXT NOT NULL CHECK (tier IN ('normal', 'deep')),
            is_valid BOOLEAN NOT NULL,
            reject_reason TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (raw_id, tier)
        )`);

        // Predictions Final
        await client.query(`CREATE TABLE IF NOT EXISTS predictions_final (
            id BIGSERIAL PRIMARY KEY,
            tier TEXT NOT NULL CHECK (tier IN ('normal', 'deep')),
            type TEXT NOT NULL CHECK (type IN ('single', 'acca')),
            matches JSONB NOT NULL,
            total_confidence REAL NOT NULL,
            risk_level TEXT NOT NULL CHECK (risk_level IN ('safe', 'medium')),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);

        // Tier Rules
        await client.query(`CREATE TABLE IF NOT EXISTS tier_rules (
            tier TEXT PRIMARY KEY CHECK (tier IN ('normal', 'deep')),
            min_confidence REAL NOT NULL,
            allowed_markets JSONB NOT NULL,
            max_acca_size INTEGER NOT NULL,
            allowed_volatility JSONB NOT NULL
        )`);

        // Acca Rules
        await client.query(`CREATE TABLE IF NOT EXISTS acca_rules (
            id BIGSERIAL PRIMARY KEY,
            rule_name TEXT NOT NULL UNIQUE,
            rule_value JSONB NOT NULL
        )`);

        // Initial Rules Data
        await client.query(`
            INSERT INTO tier_rules (tier, min_confidence, allowed_markets, max_acca_size, allowed_volatility)
            VALUES
                ('normal', 60, '["1X2","double_chance","over_2_5","btts_yes"]'::JSONB, 3, '["low","medium"]'::JSONB),
                ('deep', 75, '["ALL"]'::JSONB, 5, '["low"]'::JSONB)
            ON CONFLICT (tier) DO UPDATE SET
                min_confidence = EXCLUDED.min_confidence,
                allowed_markets = EXCLUDED.allowed_markets,
                max_acca_size = EXCLUDED.max_acca_size,
                allowed_volatility = EXCLUDED.allowed_volatility;
        `);

        await client.query(`
            INSERT INTO acca_rules (rule_name, rule_value)
            VALUES
                ('no_same_match', 'true'::JSONB),
                ('no_conflicting_markets', 'true'::JSONB),
                ('max_per_match', '1'::JSONB),
                ('allow_high_volatility', 'false'::JSONB)
            ON CONFLICT (rule_name) DO UPDATE SET
                rule_value = EXCLUDED.rule_value;
        `);

        // Prediction Results (Historical Data)
        await client.query(`CREATE TABLE IF NOT EXISTS prediction_results (
            id BIGSERIAL PRIMARY KEY,
            match_id TEXT NOT NULL,
            sport TEXT NOT NULL,
            prediction_type TEXT NOT NULL, -- 'normal', 'deep'
            market TEXT NOT NULL,
            prediction TEXT NOT NULL,
            actual_outcome TEXT,
            status TEXT NOT NULL CHECK (status IN ('Win', 'Loss', 'Pending')),
            confidence REAL,
            odds REAL,
            settled_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`);

        // Insert some dummy historical data if the table is empty
        const countRes = await client.query('SELECT COUNT(*) FROM prediction_results');
        if (parseInt(countRes.rows[0].count) === 0) {
            console.log('Inserting dummy historical data into prediction_results...');
            const dummyData = [
                ['EPL_1', 'football', 'normal', '1X2', 'Home Win', 'Home Win', 'Win', 72, 1.85],
                ['EPL_2', 'football', 'deep', '1X2', 'Away Win', 'Draw', 'Loss', 81, 2.10],
                ['NBA_1', 'basketball', 'normal', 'Spread', 'Lakers -4.5', 'Lakers -4.5', 'Win', 68, 1.91],
                ['NBA_2', 'basketball', 'deep', 'Over/Under', 'Over 210.5', 'Over 210.5', 'Win', 79, 1.91],
                ['MLB_1', 'baseball', 'normal', 'Moneyline', 'Dodgers', 'Dodgers', 'Win', 65, 1.70],
                ['NFL_1', 'nfl', 'deep', '1X2', 'Chiefs', 'Chiefs', 'Win', 85, 1.55],
                ['UFC_1', 'mma', 'normal', 'Winner', 'McGregor', 'Loss', 'Loss', 74, 1.65],
                ['F1_1', 'formula1', 'deep', 'Winner', 'Verstappen', 'Verstappen', 'Win', 92, 1.40]
            ];
            for (const row of dummyData) {
                await client.query(
                    `INSERT INTO prediction_results (match_id, sport, prediction_type, market, prediction, actual_outcome, status, confidence, odds, settled_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW() - INTERVAL '1 day')`,
                    row
                );
            }
        }

        await client.query('COMMIT');
        console.log('Database tables initialized.');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error initializing tables:', err);
    } finally {
        client.release();
    }
}

// ========== HELPER FUNCTIONS (PostgreSQL versions) ==========

// Get match by ID
async function getMatch(matchId) {
    const ok = await ensureDbInitialized();
    if (!ok) return null;
    const res = await pool.query(
        `SELECT m.*, 
                ht.name as home_team,
                at.name as away_team
         FROM matches m
         LEFT JOIN teams ht ON m.home_team_id = ht.id
         LEFT JOIN teams at ON m.away_team_id = at.id
         WHERE m.id = $1`,
        [matchId]
    );
    return res.rows[0];
}

// Get team stats for a team (most recent season)
async function getTeamStats(teamId) {
    const ok = await ensureDbInitialized();
    if (!ok) return null;
    const res = await pool.query('SELECT * FROM team_stats WHERE team_id = $1 ORDER BY season DESC LIMIT 1', [teamId]);
    return res.rows[0];
}

// Get active injuries for a team
async function getInjuries(teamId) {
    const ok = await ensureDbInitialized();
    if (!ok) return [];
    const res = await pool.query('SELECT * FROM injuries WHERE team_id = $1 AND status = $2', [teamId, 'active']);
    return res.rows;
}

// Get average news sentiment for a team over last 3 days
async function getNewsSentiment(teamId) {
    const ok = await ensureDbInitialized();
    if (!ok) return 0;
    const res = await pool.query(
        'SELECT AVG(sentiment_score) as avgSentiment FROM news_mentions WHERE team_id = $1 AND created_at > NOW() - INTERVAL \'3 days\'',
        [teamId]
    );
    return res.rows[0]?.avgSentiment || 0;
}

// Get all upcoming matches (within the next `days` days)
async function getAllUpcomingMatches(days = 7, sport = null) {
    const ok = await ensureDbInitialized();
    if (!ok) return [];
    let query = `
        SELECT m.*, l.sport 
        FROM matches m
        LEFT JOIN leagues l ON m.league_id = l.id
        WHERE m.match_date > NOW() 
          AND m.match_date < NOW() + INTERVAL '${days} days'
    `;
    const params = [];
    if (sport) {
        query += ' AND l.sport = $1';
        params.push(sport);
    }
    query += ' ORDER BY m.match_date';
    const res = await pool.query(query, params);
    return res.rows;
}

// Save a generated prediction (now includes safer_pick)
async function savePrediction(prediction) {
    const ok = await ensureDbInitialized();
    if (!ok) return { id: null };
    const {
        matchId, probHome, probDraw, probAway, bttsProb, over25Prob, under25Prob,
        recommended, avoid, accaSafe, confidence, volatility, riskFlags,
        saferPick, normalTier, deepTier, validUntil
    } = prediction;

    const res = await pool.query(
        `INSERT INTO predictions (
            match_id, prob_home, prob_draw, prob_away, btts_prob, over25_prob, under25_prob,
            recommended, avoid, acca_safe, confidence, volatility, risk_flags, safer_pick,
            normal_tier, deep_tier, valid_until
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
        [
            matchId, probHome, probDraw, probAway, bttsProb, over25Prob, under25Prob,
            JSON.stringify(recommended), JSON.stringify(avoid), accaSafe ? 1 : 0,
            confidence, volatility, JSON.stringify(riskFlags), saferPick,
            normalTier ? 1 : 0, deepTier ? 1 : 0, validUntil
        ]
    );
    return { id: res.rows[0].id };
}

// Get predictions filtered by subscription tier and date (now includes safer_pick)
async function getPredictionsByTier(tier, date) {
    const ok = await ensureDbInitialized();
    if (!ok) return [];
    const tierConfig = require('./config').tiers[tier];
    if (!tierConfig) throw new Error('Invalid tier');

    const tierField = tierConfig.deep ? 'deep_tier' : 'normal_tier';
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    const res = await pool.query(
        `SELECT p.*, 
            (p.matches->>'home_team')::text as home_team_name,
            (p.matches->>'away_team')::text as away_team_name,
            (p.matches->>'sport')::text as sport,
            (p.matches->>'match_date')::timestamp as match_date
        FROM predictions_final p
        WHERE p.tier = $1
          AND p.created_at BETWEEN $2 AND $3
        ORDER BY p.total_confidence DESC
        LIMIT $4`,
        [tierConfig.deep ? 'deep' : 'normal', startDate.toISOString(), endDate.toISOString(), tierConfig.daily]
    );

    // Flatten match data from JSONB array for frontend compatibility
    res.rows.forEach(r => {
        if (r.matches && Array.isArray(r.matches)) {
            const firstMatch = r.matches[0] || {};
            r.home_team = firstMatch.home_team || null;
            r.away_team = firstMatch.away_team || null;
            r.prediction = firstMatch.prediction || null;
            r.confidence = firstMatch.confidence || null;
            r.odds = firstMatch.odds || null;
            r.market = firstMatch.market || null;
            r.volatility = firstMatch.volatility || null;
        }
    });

    return res.rows;
}

async function insertFinalPredictionRow({
    match_id,
    prediction,
    confidence,
    stage,
    is_final,
    home_team,
    away_team
}) {
    const ok = await ensureDbInitialized();
    if (!ok) return { id: null };

    const res = await pool.query(
        `INSERT INTO predictions (
            match_id,
            prediction,
            confidence,
            stage,
            is_final,
            home_team,
            away_team
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, created_at`,
        [
            match_id,
            prediction,
            confidence,
            stage,
            is_final,
            home_team,
            away_team
        ]
    );

    return res.rows[0];
}

async function getLatestPredictions(limit = 50) {
    const ok = await ensureDbInitialized();
    if (!ok) return [];

    const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, limit)) : 50;
    const res = await pool.query(
        'SELECT * FROM predictions ORDER BY created_at DESC LIMIT $1',
        [safeLimit]
    );
    return res.rows;
}

// ========== USER HELPERS ==========

async function createUser(email, passwordHash, subscriptionType = 'normal', expiryDays = 30) {
    const ok = await ensureDbInitialized();
    if (!ok) throw new Error('DATABASE_URL not configured');
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + expiryDays);

    const res = await pool.query(
        'INSERT INTO users (email, password_hash, subscription_type, subscription_expiry) VALUES ($1, $2, $3, $4) RETURNING id, email, subscription_type',
        [email, passwordHash, subscriptionType, expiry]
    );
    return res.rows[0];
}

async function findUserByEmail(email) {
    const ok = await ensureDbInitialized();
    if (!ok) return null;
    const res = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return res.rows[0];
}

async function findUserById(id) {
    const ok = await ensureDbInitialized();
    if (!ok) return null;
    const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows[0];
}

async function getProfileById(id) {
    const ok = await ensureDbInitialized();
    if (!ok) return null;
    const res = await pool.query('SELECT * FROM profiles WHERE id = $1', [id]);
    return res.rows[0] || null;
}

async function upsertProfile({ id, email, subscription_status = 'inactive', is_test_user = false, plan_id = null, plan_tier = null, plan_expires_at = null }) {
    const ok = await ensureDbInitialized();
    if (!ok) return null;
    const res = await pool.query(
        `INSERT INTO profiles (id, email, subscription_status, is_test_user, plan_id, plan_tier, plan_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id)
         DO UPDATE SET
            email = COALESCE(EXCLUDED.email, profiles.email),
            subscription_status = EXCLUDED.subscription_status,
            is_test_user = EXCLUDED.is_test_user,
            plan_id = COALESCE(EXCLUDED.plan_id, profiles.plan_id),
            plan_tier = COALESCE(EXCLUDED.plan_tier, profiles.plan_tier),
            plan_expires_at = COALESCE(EXCLUDED.plan_expires_at, profiles.plan_expires_at)
         RETURNING *`,
        [id, email, subscription_status, is_test_user, plan_id, plan_tier, plan_expires_at]
    );
    return res.rows[0] || null;
}

// ========== ACCURACY HELPERS ==========

async function updateAccuracyStats() {
    // Placeholder – you can implement this later
    console.log('Weekly accuracy update not yet implemented for PostgreSQL');
}

async function getAccuracyStats() {
    const ok = await ensureDbInitialized();
    if (!ok) {
        return {
            overall: { total: 0, wins: 0, winRate: 0 },
            byTier: [],
            bySport: []
        };
    }
    // Overall stats
    const overall = await pool.query(
        `SELECT COUNT(*) as total, 
                SUM(CASE WHEN status = 'Win' THEN 1 ELSE 0 END) as wins,
                ROUND(100.0 * SUM(CASE WHEN status = 'Win' THEN 1 ELSE 0 END) / COUNT(*), 1) as winRate
         FROM prediction_results`
    );

    // By tier
    const byTier = await pool.query(
        `SELECT prediction_type as tier, COUNT(*) as total,
                SUM(CASE WHEN status = 'Win' THEN 1 ELSE 0 END) as wins,
                ROUND(100.0 * SUM(CASE WHEN status = 'Win' THEN 1 ELSE 0 END) / COUNT(*), 1) as winRate
         FROM prediction_results
         GROUP BY prediction_type`
    );

    // By sport
    const bySport = await pool.query(
        `SELECT sport, COUNT(*) as total,
                SUM(CASE WHEN status = 'Win' THEN 1 ELSE 0 END) as wins,
                ROUND(100.0 * SUM(CASE WHEN status = 'Win' THEN 1 ELSE 0 END) / COUNT(*), 1) as winRate
         FROM prediction_results
         GROUP BY sport`
    );

    return {
        overall: overall.rows[0] || { total: 0, wins: 0, winRate: 0 },
        byTier: byTier.rows,
        bySport: bySport.rows
    };
}

// ========== EXPORTS ==========
module.exports = {
    pool, // for advanced use
    ensureDbInitialized,
    getMatch,
    getTeamStats,
    getInjuries,
    getNewsSentiment,
    getAllUpcomingMatches,
    savePrediction,
    getPredictionsByTier,
    insertFinalPredictionRow,
    getLatestPredictions,
    createUser,
    findUserByEmail,
    findUserById,
    getProfileById,
    upsertProfile,
    updateAccuracyStats,
    getAccuracyStats
};