// insertLeagues.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    }
    console.log('Connected to database.');
});

// Sample leagues data
const leagues = [
    { sport: 'football', name: 'Premier League', api_source: 'api-sports', api_league_id: '39' },
    { sport: 'football', name: 'La Liga', api_source: 'api-sports', api_league_id: '140' },
    { sport: 'basketball', name: 'NBA', api_source: 'api-sports', api_league_id: '12' }
];

db.serialize(() => {
    // Check if leagues already exist to avoid duplicates
    db.get("SELECT COUNT(*) as count FROM leagues", (err, row) => {
        if (err) {
            console.error('Error checking leagues:', err);
            return;
        }
        if (row.count === 0) {
            const stmt = db.prepare('INSERT INTO leagues (sport, name, api_source, api_league_id) VALUES (?, ?, ?, ?)');
            leagues.forEach(l => {
                stmt.run(l.sport, l.name, l.api_source, l.api_league_id, function(err) {
                    if (err) console.error('Insert error:', err);
                });
            });
            stmt.finalize();
            console.log('Sample leagues inserted.');
        } else {
            console.log('Leagues already exist, skipping insertion.');
        }
    });
});

db.close((err) => {
    if (err) console.error('Error closing database:', err);
    else console.log('Database connection closed.');
});