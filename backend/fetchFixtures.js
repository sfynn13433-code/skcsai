const { Pool } = require('pg');
const { APISportsClient } = require('./apiClients');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const client = new APISportsClient();

// Helper: compute the correct season for a given sport and current date
function getSeasonForSport(sport, date = new Date()) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // JavaScript months are 0-indexed

    let season;
    if (sport === 'football') {
        // European football season: Aug–May. If before August, season started previous year.
        season = month >= 8 ? year : year - 1;
    } else if (sport === 'basketball') {
        // NBA season: Oct–June. If before October, season started previous year.
        season = month >= 10 ? year : year - 1;
    } else {
        season = year;
    }

    // Free plan restriction: can't access seasons > 2024
    if (season > 2024) season = 2024;
    return season;
}

// Get or create team using api_team_id first, then fallback to name
async function getOrCreateTeam(leagueId, teamData) {
    const { id: apiTeamId, name } = teamData;

    // Try to find by api_team_id
    const res = await pool.query(
        'SELECT id FROM teams WHERE league_id = $1 AND api_team_id = $2',
        [leagueId, apiTeamId]
    );
    if (res.rows.length > 0) return res.rows[0].id;

    // Check by name (in case we already have it without api_team_id)
    const nameRes = await pool.query(
        'SELECT id FROM teams WHERE league_id = $1 AND name = $2',
        [leagueId, name]
    );
    if (nameRes.rows.length > 0) {
        // Update the existing team with api_team_id
        await pool.query(
            'UPDATE teams SET api_team_id = $1 WHERE id = $2',
            [apiTeamId, nameRes.rows[0].id]
        );
        return nameRes.rows[0].id;
    }

    // Insert new team
    const insert = await pool.query(
        'INSERT INTO teams (league_id, name, api_team_id) VALUES ($1, $2, $3) RETURNING id',
        [leagueId, name, apiTeamId]
    );
    return insert.rows[0].id;
}

// Fetch fixtures for a league (without pagination)
async function fetchFixtures(leagueApiId, season, fromDate, toDate, sport) {
    console.log(`   Fetching fixtures...`);
    const data = await client.getFixtures(leagueApiId, season, {
        from: fromDate,
        to: toDate
        // no page parameter – free plan may not support pagination
    }, sport);

    if (!data || !data.response) {
        console.log(`   No data received`);
        return [];
    }

    if (data.errors && Object.keys(data.errors).length > 0) {
        console.log('   API errors:', data.errors);
        return [];
    }

    console.log(`   Received ${data.results || 0} fixtures.`);
    return data.response;
}

async function fetchAndStoreFixtures() {
    console.log('Fetching leagues from database...');
    const leaguesRes = await pool.query('SELECT id, api_league_id, sport, name FROM leagues');
    const leagues = leaguesRes.rows;

    if (leagues.length === 0) {
        console.log('No leagues found. Please insert leagues first.');
        return;
    }

    // Date range: next 30 days
    const fromDate = new Date().toISOString().split('T')[0]; // today YYYY-MM-DD
    const toDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    for (const league of leagues) {
        if (!league.api_league_id) {
            console.log(`League ${league.name} has no api_league_id, skipping.`);
            continue;
        }

        // Skip basketball for now (endpoint issue)
        if (league.sport === 'basketball') {
            console.log(`\nSkipping ${league.name} (basketball) - endpoint needs investigation.`);
            continue;
        }

        const season = getSeasonForSport(league.sport);
        console.log(`\nProcessing ${league.name} (${league.sport})...`);
        console.log(`  Season: ${season}, From: ${fromDate} To: ${toDate}`);

        const fixtures = await fetchFixtures(league.api_league_id, season, fromDate, toDate, league.sport);
        console.log(`  Total fixtures to process: ${fixtures.length}`);

        let inserted = 0;
        for (const fixture of fixtures) {
            const match = fixture.fixture;
            const teams = fixture.teams;
            const homeTeamData = teams.home;
            const awayTeamData = teams.away;
            const matchDate = match.date;

            const homeTeamId = await getOrCreateTeam(league.id, homeTeamData);
            const awayTeamId = await getOrCreateTeam(league.id, awayTeamData);

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
                    [league.id, homeTeamId, awayTeamId, matchDate, match.status?.short || 'NS']
                );
                inserted++;
            }
        }
        console.log(`  Inserted ${inserted} new matches for ${league.name}`);
    }
    console.log('\nFixture fetching complete.');
}

fetchAndStoreFixtures()
    .catch(console.error)
    .finally(() => pool.end());