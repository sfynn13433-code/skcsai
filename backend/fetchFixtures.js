// fetchFixtures.js (PostgreSQL version)
const { Pool } = require('pg');
const axios = require('axios');
require('dotenv').config();

// Database connection using the same environment variable as your server
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for Supabase
});

// TheSportsDB API key (public demo key)
const SPORTSDB_KEY = '123';

// Mapping of our league IDs to TheSportsDB league IDs
const leagueIdMapping = {
    1: 4328,  // Premier League (football)
    2: 4335,  // La Liga (football)
    3: 4391   // NBA (basketball)
    // Add more mappings as needed
};

async function fetchAndStoreFixtures() {
    console.log('Fetching leagues from database...');
    let client;
    try {
        client = await pool.connect();
        // Get all leagues from the database
        const leaguesRes = await client.query('SELECT id, sport, name FROM leagues');
        const leagues = leaguesRes.rows;

        if (leagues.length === 0) {
            console.log('No leagues found in database. Please insert leagues first.');
            return;
        }

        for (const league of leagues) {
            const sportsdbLeagueId = leagueIdMapping[league.id];
            if (!sportsdbLeagueId) {
                console.log(`No TheSportsDB mapping for league ${league.id} (${league.name}), skipping.`);
                continue;
            }

            console.log(`Fetching fixtures for league ${league.id} (${league.name}) from TheSportsDB...`);
            try {
                const url = `https://www.thesportsdb.com/api/v1/json/${SPORTSDB_KEY}/eventsnextleague.php?id=${sportsdbLeagueId}`;
                const response = await axios.get(url);
                const data = response.data;

                if (!data.events || data.events.length === 0) {
                    console.log(`No events found for league ${league.id}`);
                    continue;
                }

                let inserted = 0;
                for (const event of data.events) {
                    const homeTeamName = event.strHomeTeam;
                    const awayTeamName = event.strAwayTeam;
                    const matchDate = event.dateEvent + 'T' + (event.strTime || '00:00:00');

                    // Get or create team (simplified: insert if not exists)
                    // First, try to find the team by name and league
                    let homeTeamId, awayTeamId;

                    const homeCheck = await client.query(
                        'SELECT id FROM teams WHERE league_id = $1 AND name = $2',
                        [league.id, homeTeamName]
                    );
                    if (homeCheck.rows.length > 0) {
                        homeTeamId = homeCheck.rows[0].id;
                    } else {
                        const insertHome = await client.query(
                            'INSERT INTO teams (league_id, name) VALUES ($1, $2) RETURNING id',
                            [league.id, homeTeamName]
                        );
                        homeTeamId = insertHome.rows[0].id;
                    }

                    const awayCheck = await client.query(
                        'SELECT id FROM teams WHERE league_id = $1 AND name = $2',
                        [league.id, awayTeamName]
                    );
                    if (awayCheck.rows.length > 0) {
                        awayTeamId = awayCheck.rows[0].id;
                    } else {
                        const insertAway = await client.query(
                            'INSERT INTO teams (league_id, name) VALUES ($1, $2) RETURNING id',
                            [league.id, awayTeamName]
                        );
                        awayTeamId = insertAway.rows[0].id;
                    }

                    // Check if match already exists
                    const matchCheck = await client.query(
                        `SELECT id FROM matches WHERE league_id = $1 AND home_team_id = $2 AND away_team_id = $3 AND match_date = $4`,
                        [league.id, homeTeamId, awayTeamId, matchDate]
                    );

                    if (matchCheck.rows.length === 0) {
                        await client.query(
                            `INSERT INTO matches (league_id, home_team_id, away_team_id, match_date, status)
                             VALUES ($1, $2, $3, $4, $5)`,
                            [league.id, homeTeamId, awayTeamId, matchDate, event.strStatus || 'scheduled']
                        );
                        inserted++;
                    }
                }
                console.log(`Inserted ${inserted} new matches for league ${league.id}`);
            } catch (error) {
                console.error(`Error fetching fixtures for league ${league.id}:`, error.message);
            }

            // Small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log('Fixture fetching complete.');
    } catch (err) {
        console.error('Database error:', err);
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

fetchAndStoreFixtures().catch(console.error);