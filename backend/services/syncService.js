'use strict';

const { runPipelineForMatches, rebuildFinalOutputs } = require('./aiPipeline');
const { buildLiveData } = require('./dataProvider');
const config = require('../config');

/**
 * Supported sports and their configurations
 * These are the REAL leagues the AI will now look for.
 */
const SPORTS_CONFIG = [
    { sport: 'football', leagueId: process.env.APISPORTS_LEAGUE_ID || '39', season: process.env.APISPORTS_SEASON || '2023' },
    { sport: 'mma_mixed_martial_arts' },
    { sport: 'americanfootball_nfl' },
    { sport: 'rugby_union' }
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
            console.log(`[syncService] Fetching REAL matches for: ${item.sport}...`);
            
            // This calls your API providers (The Odds API, etc.)
            const matches = await buildLiveData(item);
            
            if (matches && matches.length > 0) {
                console.log(`[syncService] Found ${matches.length} REAL matches for ${item.sport}. Running AI Analysis...`);
                
                // This runs the AI Logic and saves it to Supabase
                await runPipelineForMatches(matches);
                totalMatchesProcessed += matches.length;
            } else {
                console.log(`[syncService] No upcoming REAL matches found for ${item.sport} right now.`);
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
