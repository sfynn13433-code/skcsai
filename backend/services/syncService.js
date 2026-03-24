'use strict';

const { runPipelineForMatches, rebuildFinalOutputs } = require('./aiPipeline');
const { buildLiveData } = require('./dataProvider');
const config = require('../config');

/**
 * Supported sports and their configurations
 * These are the REAL leagues the AI will now look for.
 */
const SPORTS_CONFIG = [
    // Football - Premier League (free plan: 2022-2024, Odds API fallback)
    { sport: 'football',          leagueId: '39',  season: '2024', oddsKey: 'soccer_epl' },
    // Basketball - EuroLeague
    { sport: 'basketball',        leagueId: '120', season: '2023-2024', oddsKey: 'basketball_euroleague' },
    // NBA
    { sport: 'nba',               leagueId: '12',  season: '2024', oddsKey: 'basketball_nba' },
    // American Football - NFL
    { sport: 'american_football', leagueId: '1',   season: '2024', oddsKey: 'americanfootball_nfl' },
    // Rugby
    { sport: 'rugby',             leagueId: '44',  season: '2024', oddsKey: 'rugbyunion_international' },
    // Hockey - NHL
    { sport: 'hockey',            leagueId: '57',  season: '2024', oddsKey: 'icehockey_nhl' },
    // Baseball - MLB
    { sport: 'baseball',          leagueId: '1',   season: '2024', oddsKey: 'baseball_mlb' },
    // AFL
    { sport: 'afl',               leagueId: '1',   season: '2024', oddsKey: 'aussierules_afl' },
    // Handball
    { sport: 'handball',          leagueId: '30',  season: '2024', oddsKey: null },
    // Volleyball
    { sport: 'volleyball',        leagueId: '78',  season: '2024', oddsKey: null },
    // Formula 1
    { sport: 'formula1',          leagueId: null,  season: '2024', oddsKey: null },
    // MMA
    { sport: 'mma',               leagueId: null,  season: '2024', oddsKey: 'mma_mixed_martial_arts' },
];

/**
 * syncAllSports
 * This function clears out the "Test Data" and pulls REAL matches 
 * from the providers into your Supabase database.
 */
async function syncAllSports() {
    console.log('[syncService] Starting master sports data sync for REAL matches...');
    
    // FORCE REAL MODE: We ignore the 'test' config to ensure real data flows.
    try {
        let totalMatchesProcessed = 0;

        for (const item of SPORTS_CONFIG) {
            try {
                console.log(`[syncService] Fetching REAL matches for: ${item.sport}...`);
                
                const matches = await buildLiveData(item);
                
                if (matches && matches.length > 0) {
                    console.log(`[syncService] Found ${matches.length} REAL matches for ${item.sport}. Running AI Analysis...`);
                    await runPipelineForMatches({ matches });
                    totalMatchesProcessed += matches.length;
                    console.log(`[syncService] ${item.sport}: pipeline complete for ${matches.length} matches`);
                } else {
                    console.log(`[syncService] No upcoming REAL matches found for ${item.sport} right now.`);
                }
            } catch (sportErr) {
                console.error(`[syncService] ERROR processing ${item.sport}:`, sportErr.message);
            }
        }

        if (totalMatchesProcessed > 0) {
            console.log('[syncService] Sync successful. Rebuilding final outputs for the website...');
            // This moves the AI results into the 'predictions_final' table the website sees.
            await rebuildFinalOutputs();
            console.log('[syncService] Master sync complete! Real data is now live.');
        } else {
            console.warn('[syncService] Sync finished but 0 real matches were found. Check your API Keys.');
        }

    } catch (error) {
        console.error('[syncService] Master sync failed:', error.message);
    }
}

// Allow manual trigger via command line
if (require.main === module) {
    syncAllSports()
        .then(() => {
            console.log('[syncService] Manual process finished.');
            process.exit(0);
        })
        .catch((err) => {
            console.error('[syncService] Manual process crashed:', err);
            process.exit(1);
        });
}

module.exports = {
    syncAllSports
};