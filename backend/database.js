const { Pool } = require('pg');
const config = require('./config');
console.log('✅ LOADING database.js (PostgreSQL version)');

// Create a connection pool to Supabase PostgreSQL
const pool = new Pool({
    connectionString: config.database.url,
    ssl: { rejectUnauthorized: false } // Required for Supabase
});

// Test the connection
pool.connect((err, client, release) => {
    if (err) {
        console.error('Error connecting to Supabase:', err.stack);
    } else {
        console.log('Connected to Supabase PostgreSQL.');
        release();
        initializeTables();
    }
});

// Initialize tables if they don't exist
async function initializeTables() {
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

        // Predictions table
        await client.query(`CREATE TABLE IF NOT EXISTS predictions (
            id SERIAL PRIMARY KEY,
            match_id INTEGER REFERENCES matches(id),
            prob_home REAL,
            prob_draw REAL,
            prob_away REAL,
            btts_prob REAL,
            over25_prob REAL,
            under25_prob REAL,
            recommended TEXT,
            avoid TEXT,
            acca_safe INTEGER,
            confidence INTEGER,
            volatility TEXT,
            risk_flags TEXT,
            normal_tier INTEGER,
            deep_tier INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            valid_until TIMESTAMP
        )`);

        // Users table
        await client.query(`CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            subscription_type TEXT DEFAULT 'normal',
            subscription_expiry TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        // Prediction results table (for accuracy)
        await client.query(`CREATE TABLE IF NOT EXISTS prediction_results (
            id SERIAL PRIMARY KEY,
            match_id INTEGER REFERENCES matches(id),
            sport TEXT,
            league TEXT,
            prediction_type TEXT,
            predicted_outcome TEXT,
            actual_result TEXT,
            status TEXT,
            confidence INTEGER,
            loss_reason TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

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
    const res = await pool.query('SELECT * FROM matches WHERE id = $1', [matchId]);
    return res.rows[0];
}

// Get team stats for a team (most recent season)
async function getTeamStats(teamId) {
    const res = await pool.query('SELECT * FROM team_stats WHERE team_id = $1 ORDER BY season DESC LIMIT 1', [teamId]);
    return res.rows[0];
}

// Get active injuries for a team
async function getInjuries(teamId) {
    const res = await pool.query('SELECT * FROM injuries WHERE team_id = $1 AND status = $2', [teamId, 'active']);
    return res.rows;
}

// Get average news sentiment for a team over last 3 days
async function getNewsSentiment(teamId) {
    const res = await pool.query(
        'SELECT AVG(sentiment_score) as avgSentiment FROM news_mentions WHERE team_id = $1 AND created_at > NOW() - INTERVAL \'3 days\'',
        [teamId]
    );
    return res.rows[0]?.avgsentiment || 0;
}

// Get all upcoming matches (within the next `days` days)
async function getAllUpcomingMatches(days = 7, sport = null) {
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

// Save a generated prediction
async function savePrediction(prediction) {
    const {
        matchId, probHome, probDraw, probAway, bttsProb, over25Prob, under25Prob,
        recommended, avoid, accaSafe, confidence, volatility, riskFlags,
        normalTier, deepTier, validUntil
    } = prediction;

    const res = await pool.query(
        `INSERT INTO predictions (
            match_id, prob_home, prob_draw, prob_away, btts_prob, over25_prob, under25_prob,
            recommended, avoid, acca_safe, confidence, volatility, risk_flags,
            normal_tier, deep_tier, valid_until
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING id`,
        [
            matchId, probHome, probDraw, probAway, bttsProb, over25Prob, under25Prob,
            JSON.stringify(recommended), JSON.stringify(avoid), accaSafe ? 1 : 0,
            confidence, volatility, JSON.stringify(riskFlags),
            normalTier ? 1 : 0, deepTier ? 1 : 0, validUntil
        ]
    );
    return { id: res.rows[0].id };
}

// Get predictions filtered by subscription tier and date
async function getPredictionsByTier(tier, date) {
    const tierConfig = require('./config').tiers[tier];
    if (!tierConfig) throw new Error('Invalid tier');

    const tierField = tierConfig.deep ? 'deep_tier' : 'normal_tier';
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    const res = await pool.query(
        `SELECT p.*, m.match_date, 
            home_team.name as home_team_name, away_team.name as away_team_name,
            l.name as league_name, l.sport
        FROM predictions p
        JOIN matches m ON p.match_id = m.id
        JOIN teams home_team ON m.home_team_id = home_team.id
        JOIN teams away_team ON m.away_team_id = away_team.id
        JOIN leagues l ON m.league_id = l.id
        WHERE p.${tierField} = 1
          AND m.match_date BETWEEN $1 AND $2
        ORDER BY p.confidence DESC
        LIMIT $3`,
        [startDate.toISOString(), endDate.toISOString(), tierConfig.daily]
    );

    // Parse JSON fields
    res.rows.forEach(r => {
        r.recommended = JSON.parse(r.recommended || '[]');
        r.avoid = JSON.parse(r.avoid || '[]');
        r.risk_flags = JSON.parse(r.risk_flags || '[]');
    });

    return res.rows;
}

// ========== USER HELPERS ==========

async function createUser(email, passwordHash, subscriptionType = 'normal', expiryDays = 30) {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + expiryDays);
    const res = await pool.query(
        'INSERT INTO users (email, password_hash, subscription_type, subscription_expiry) VALUES ($1, $2, $3, $4) RETURNING id, email, subscription_type',
        [email, passwordHash, subscriptionType, expiry]
    );
    return res.rows[0];
}

async function findUserByEmail(email) {
    const res = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return res.rows[0];
}

async function findUserById(id) {
    const res = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return res.rows[0];
}

// ========== ACCURACY HELPERS ==========

async function updateAccuracyStats() {
    // Placeholder – you can implement this later
    console.log('Weekly accuracy update not yet implemented for PostgreSQL');
}

async function getAccuracyStats() {
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
    getMatch,
    getTeamStats,
    getInjuries,
    getNewsSentiment,
    getAllUpcomingMatches,
    savePrediction,
    getPredictionsByTier,
    createUser,
    findUserByEmail,
    findUserById,
    updateAccuracyStats,
    getAccuracyStats
};
