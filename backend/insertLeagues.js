// insertLeagues.js (PostgreSQL version)
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for Supabase
});

async function insertLeagues() {
    const client = await pool.connect();
    try {
        console.log('Connected to database. Inserting leagues...');

        const leagues = [
            { sport: 'football', name: 'Premier League', api_source: 'thesportsdb', api_league_id: '4328' },
            { sport: 'football', name: 'La Liga', api_source: 'thesportsdb', api_league_id: '4335' },
            { sport: 'basketball', name: 'NBA', api_source: 'thesportsdb', api_league_id: '4391' }
        ];

        for (const league of leagues) {
            const check = await client.query(
                'SELECT id FROM leagues WHERE name = $1 AND sport = $2',
                [league.name, league.sport]
            );
            if (check.rows.length === 0) {
                await client.query(
                    `INSERT INTO leagues (sport, name, api_source, api_league_id)
                     VALUES ($1, $2, $3, $4)`,
                    [league.sport, league.name, league.api_source, league.api_league_id]
                );
                console.log(`Inserted: ${league.name}`);
            } else {
                console.log(`League already exists: ${league.name}`);
            }
        }

        console.log('League insertion complete.');
    } catch (err) {
        console.error('Error inserting leagues:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

insertLeagues();