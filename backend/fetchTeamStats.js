const { Pool } = require('pg');
const { APISportsClient } = require('./apiClients');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const client = new APISportsClient();
const SEASON = 2024; // Free plan max season

async function updateTeamApiId(leagueId, apiTeamId, teamName) {
    // Try to find team by name (case‑insensitive)
    const res = await pool.query(
        'SELECT id FROM teams WHERE league_id = $1 AND name ILIKE $2',
        [leagueId, `%${teamName}%`]
    );
    if (res.rows.length > 0) {
        // Update with api_team_id
        await pool.query(
            'UPDATE teams SET api_team_id = $1 WHERE id = $2',
            [apiTeamId, res.rows[0].id]
        );
        return res.rows[0].id;
    }
    console.log(`⚠️ Team not found in DB: ${teamName} (league ${leagueId})`);
    return null;
}

async function fetchAndStoreTeamStats() {
    console.log('Fetching teams and stats from API‑Sports...');

    const leaguesRes = await pool.query('SELECT id, api_league_id, sport, name FROM leagues');
    const leagues = leaguesRes.rows;

    for (const league of leagues) {
        if (!league.api_league_id) {
            console.log(`League ${league.name} has no api_league_id, skipping.`);
            continue;
        }
        if (league.sport !== 'football') {
            console.log(`Skipping ${league.name} (${league.sport}) – only football supported for now.`);
            continue;
        }

        console.log(`\nProcessing ${league.name} (sport: ${league.sport})...`);

        // Fetch teams for this league
        const teamsData = await client.getTeams(league.api_league_id, SEASON);
        if (!teamsData || !teamsData.response) {
            console.log(`No teams data for league ${league.name}`);
            continue;
        }

        console.log(`Received ${teamsData.response.length} teams.`);

        for (const team of teamsData.response) {
            const apiTeamId = team.team.id;
            const teamName = team.team.name;

            // Update teams table with api_team_id
            const dbTeamId = await updateTeamApiId(league.id, apiTeamId, teamName);
            if (!dbTeamId) continue;

            // Fetch team statistics
            const statsData = await client.getTeamStats(league.api_league_id, SEASON, apiTeamId);
            if (!statsData || !statsData.response) {
                console.log(`No stats for team ${teamName}`);
                continue;
            }

            const stats = statsData.response;
            const fixtures = stats.fixtures || {};
            const goals = stats.goals || {};

            // Insert into team_stats
            await pool.query(
                `INSERT INTO team_stats (
                    team_id, season, matches_played, wins, draws, losses,
                    goals_for, goals_against, points, form_rating
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                ON CONFLICT (team_id, season) DO NOTHING`,
                [
                    dbTeamId,
                    SEASON.toString(),
                    fixtures.played?.total || 0,
                    fixtures.wins?.total || 0,
                    fixtures.draws?.total || 0,
                    fixtures.loses?.total || 0,
                    goals.for?.total?.total || 0,
                    goals.against?.total?.total || 0,
                    fixtures.points || 0,
                    stats.form ? parseFloat(stats.form) : null
                ]
            );
            console.log(`✅ Stats inserted for ${teamName}`);
        }
    }
    console.log('\nTeam stats fetching complete.');
}

fetchAndStoreTeamStats()
    .catch(console.error)
    .finally(() => pool.end());