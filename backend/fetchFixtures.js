// fetchFixtures.js (using TheSportsDB)
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

// TheSportsDB API key (public demo key)
const SPORTSDB_KEY = '123';

// Helper to find or create a team
async function getOrCreateTeam(leagueId, teamName) {
    return new Promise((resolve, reject) => {
        db.get('SELECT id FROM teams WHERE league_id = ? AND name = ?', [leagueId, teamName], (err, row) => {
            if (err) return reject(err);
            if (row) return resolve(row.id);

            // Insert team
            db.run('INSERT INTO teams (league_id, name) VALUES (?, ?)', [leagueId, teamName], function(err) {
                if (err) return reject(err);
                resolve(this.lastID);
            });
        });
    });
}

// Mapping of our league IDs to TheSportsDB league IDs
const leagueIdMapping = {
    1: 4328,  // Premier League (football)
    2: 4335,  // La Liga (football)
    3: 4391   // NBA (basketball)
};

async function fetchAndStoreFixtures() {
    console.log('Fetching leagues from database...');
    const leagues = await new Promise((resolve, reject) => {
        db.all('SELECT id, sport, name FROM leagues', (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });

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

                // Get or create teams
                const homeTeamId = await getOrCreateTeam(league.id, homeTeamName);
                const awayTeamId = await getOrCreateTeam(league.id, awayTeamName);

                // Check if match already exists
                const exists = await new Promise((resolve) => {
                    db.get('SELECT id FROM matches WHERE league_id = ? AND home_team_id = ? AND away_team_id = ? AND match_date = ?',
                        [league.id, homeTeamId, awayTeamId, matchDate], (err, row) => {
                            if (err) resolve(false);
                            else resolve(!!row);
                        });
                });

                if (!exists) {
                    await new Promise((resolve, reject) => {
                        db.run(
                            `INSERT INTO matches (league_id, home_team_id, away_team_id, match_date, status)
                             VALUES (?, ?, ?, ?, ?)`,
                            [league.id, homeTeamId, awayTeamId, matchDate, event.strStatus || 'scheduled'],
                            function(err) {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    });
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
}

fetchAndStoreFixtures()
    .catch(console.error)
    .finally(() => db.close());