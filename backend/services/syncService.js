'use strict';

const { runPipelineForMatches, rebuildFinalOutputs } = require('./aiPipeline');
const { buildLiveData } = require('./dataProvider');
const config = require('../config');

/**
 * Supported sports and their configurations
 */
const SPORTS_CONFIG = [
    { sport: 'football', leagueId: process.env.APISPORTS_LEAGUE_ID, season: process.env.APISPORTS_SEASON },
    { sport: 'mma_mixed_martial_arts' },
    { sport: 'americanfootball_nfl' }
];

async function syncAllSports() {
    console.log('[syncService] Starting master sports data sync...');
    
    if (config.DATA_MODE === 'test') {
        console.log('[syncService] DATA_MODE is test, running test pipeline once.');
        const { runPipelineFromConfiguredDataMode } = require('./aiPipeline');
        await runPipelineFromConfiguredDataMode();
        await rebuildFinalOutputs();
        console.log('[syncService] Test sync complete.');
        return;
    }

    try {
        for (const item of SPORTS_CONFIG) {
            console.log(`[syncService] Syncing sport: ${item.sport}...`);
            const matches = await buildLiveData(item);
            
            if (matches.length > 0) {
                console.log(`[syncService] Found ${matches.length} matches for ${item.sport}. Running pipeline...`);
                await runPipelineForMatches(matches);
            } else {
                console.log(`[syncService] No matches found for ${item.sport}.`);
            }
        }

        console.log('[syncService] All sports fetched. Rebuilding final outputs...');
        await rebuildFinalOutputs();
        console.log('[syncService] Master sync complete!');
    } catch (error) {
        console.error('[syncService] Master sync failed:', error);
    }
}

// If run directly
if (require.main === module) {
    syncAllSports().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = {
    syncAllSports
};
