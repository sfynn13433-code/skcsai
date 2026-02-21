const { Pool } = require('pg');
const { OddsAPIClient } = require('./oddsApiClient');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const oddsClient = new OddsAPIClient(process.env.ODDS_API_KEY);

async function getOrCreateTeamByName(leagueId, teamName) {
    // Try to find by name (case-insensitive partial match)
    const res = await pool.query(
        'SELECT id FROM teams WHERE league_id = $1 AND name ILIKE $2',
        [leagueId, `%${teamName}%`]
    );
    
    if (res.rows.length > 0) return res.rows[0].id;

    // Insert new team if not found
    const insert = await pool.query(
        'INSERT INTO teams (league_id, name) VALUES ($1, $2) RETURNING id',
        [leagueId, teamName]
    );
    return insert.rows[0].id;
}

async function fetchCurrentFixtures() {
    console.log('Fetching current fixtures from Odds API...');
    
    const leaguesRes = await pool.query('SELECT id, name, sport, api_league_id FROM leagues');
    const leagues = leaguesRes.rows;

    for (const league of leagues) {
        const sportKey = oddsClient.getOddsSportKey(league.name, league.sport);
        if (!sportKey) {
            console.log(`No Odds API mapping for ${league.name}, skipping.`);
            continue;
        }

        console.log(`\nFetching ${league.name} fixtures from Odds API...`);
        const odds = await oddsClient.getOdds(sportKey);
        
        // Optional: log only a sample to avoid clutter (remove if you want full debug)
        if (odds && odds.length > 0) {
            console.log(`Received ${odds.length} events. Sample:`, odds[0]);
        } else {
            console.log('No data or empty response.');
        }

        if (!odds) {
            console.log(`No response from Odds API for ${league.name}`);
            continue;
        }

        if (!Array.isArray(odds)) {
            console.log(`Unexpected response format (not an array):`, odds);
            continue;
        }

        if (odds.length === 0) {
            console.log(`No fixtures found for ${league.name}`);
            continue;
        }

        let inserted = 0;
        for (const event of odds) {
            // Validate required fields
            if (!event.home_team || !event.away_team || !event.commence_time) {
                console.log('Skipping event with missing data:', event);
                continue;
            }

            const homeTeam = event.home_team;
            const awayTeam = event.away_team;
            const commenceTime = event.commence_time;

            // Parse the ISO string directly (no need to multiply by 1000)
            const matchDate = new Date(commenceTime).toISOString();

            const homeTeamId = await getOrCreateTeamByName(league.id, homeTeam);
            const awayTeamId = await getOrCreateTeamByName(league.id, awayTeam);

            // Check if match already exists
            const exists = await pool.query(
                `SELECT id FROM matches 
                 WHERE league_id = $1 AND home_team_id = $2 AND away_team_id = $3 AND match_date = $4`,
                [league.id, homeTeamId, awayTeamId, matchDate]
            );

            if (exists.rows.length === 0) {
                await pool.query(
                    `INSERT INTO matches (league_id, home_team_id, away_team_id, match_date, status)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [league.id, homeTeamId, awayTeamId, matchDate, 'NS']
                );
                inserted++;
            }
        }
        console.log(`Inserted ${inserted} new current fixtures for ${league.name}`);
    }
    console.log('\nCurrent fixture fetching complete.');
}

fetchCurrentFixtures()
    .catch(console.error)
    .finally(() => pool.end());