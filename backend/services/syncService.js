'use strict';

const { runPipelineForMatches, rebuildFinalOutputs } = require('./aiPipeline');
const { buildLiveData } = require('./dataProvider');
const config = require('../config');

function getSeasonStartYear() {
    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const year = now.getUTCFullYear();
    return month >= 7 ? year : year - 1;
}

const SEASON_START_YEAR = getSeasonStartYear();
const SEASON_YEAR = String(SEASON_START_YEAR);
const SEASON_RANGE = `${SEASON_START_YEAR}-${SEASON_START_YEAR + 1}`;

/**
 * Supported sports and their configurations
 * These are the REAL leagues the AI will now look for.
 */
const SPORTS_CONFIG = [
    // Soccer - England
    { sport: 'football', leagueId: '39', season: SEASON_YEAR, oddsKey: 'soccer_epl' },
    { sport: 'football', leagueId: '40', season: SEASON_YEAR, oddsKey: null },
    // Soccer - Spain
    { sport: 'football', leagueId: '140', season: SEASON_YEAR, oddsKey: 'soccer_spain_la_liga' },
    { sport: 'football', leagueId: '141', season: SEASON_YEAR, oddsKey: null },
    // Soccer - Germany
    { sport: 'football', leagueId: '78', season: SEASON_YEAR, oddsKey: 'soccer_germany_bundesliga' },
    { sport: 'football', leagueId: '79', season: SEASON_YEAR, oddsKey: null },
    // Soccer - Italy
    { sport: 'football', leagueId: '135', season: SEASON_YEAR, oddsKey: 'soccer_italy_serie_a' },
    { sport: 'football', leagueId: '136', season: SEASON_YEAR, oddsKey: null },
    // Soccer - France
    { sport: 'football', leagueId: '61', season: SEASON_YEAR, oddsKey: 'soccer_france_ligue_one' },
    { sport: 'football', leagueId: '62', season: SEASON_YEAR, oddsKey: null },
    // Soccer - International
    { sport: 'football', leagueId: '2', season: SEASON_YEAR, oddsKey: 'soccer_uefa_champs_league' },
    { sport: 'football', leagueId: '3', season: SEASON_YEAR, oddsKey: 'soccer_uefa_europa_league' },

    // Basketball / NBA
    { sport: 'nba', leagueId: '12', season: SEASON_YEAR, oddsKey: 'basketball_nba' },
    { sport: 'nba', leagueId: '20', season: SEASON_YEAR, oddsKey: null },
    { sport: 'basketball', leagueId: '117', season: SEASON_RANGE, oddsKey: null },
    { sport: 'basketball', leagueId: '85', season: SEASON_RANGE, oddsKey: null },
    { sport: 'basketball', leagueId: '120', season: SEASON_RANGE, oddsKey: 'basketball_euroleague' },

    // Rugby
    { sport: 'rugby', leagueId: '13', season: SEASON_YEAR, oddsKey: null },
    { sport: 'rugby', leagueId: '14', season: SEASON_YEAR, oddsKey: null },
    { sport: 'rugby', leagueId: '1', season: SEASON_YEAR, oddsKey: null },
    { sport: 'rugby', leagueId: '45', season: SEASON_YEAR, oddsKey: null },
    { sport: 'rugby', leagueId: '44', season: SEASON_YEAR, oddsKey: 'rugbyunion_international' },
    { sport: 'rugby', leagueId: '7', season: SEASON_YEAR, oddsKey: null },

    // American Football
    { sport: 'american_football', leagueId: '1', season: SEASON_YEAR, oddsKey: 'americanfootball_nfl' },
    { sport: 'american_football', leagueId: '2', season: SEASON_YEAR, oddsKey: null },

    // Baseball
    { sport: 'baseball', leagueId: '1', season: SEASON_YEAR, oddsKey: 'baseball_mlb' },
    { sport: 'baseball', leagueId: '2', season: SEASON_YEAR, oddsKey: null },
    { sport: 'baseball', leagueId: '3', season: SEASON_YEAR, oddsKey: null },
    { sport: 'baseball', leagueId: '96', season: SEASON_YEAR, oddsKey: null },
    { sport: 'baseball', leagueId: '97', season: SEASON_YEAR, oddsKey: null },

    // Hockey
    { sport: 'hockey', leagueId: '57', season: SEASON_YEAR, oddsKey: 'icehockey_nhl' },
    { sport: 'hockey', leagueId: '58', season: SEASON_YEAR, oddsKey: null },
    { sport: 'hockey', leagueId: '69', season: SEASON_YEAR, oddsKey: null },
    { sport: 'hockey', leagueId: '70', season: SEASON_YEAR, oddsKey: null },

    // Volleyball
    { sport: 'volleyball', leagueId: '95', season: SEASON_YEAR, oddsKey: null },
    { sport: 'volleyball', leagueId: '96', season: SEASON_YEAR, oddsKey: null },

    // Handball
    { sport: 'handball', leagueId: '82', season: SEASON_YEAR, oddsKey: null },
    { sport: 'handball', leagueId: '83', season: SEASON_YEAR, oddsKey: null },

    // Aussie Rules
    { sport: 'afl', leagueId: '1', season: SEASON_YEAR, oddsKey: 'aussierules_afl' },
    { sport: 'afl', leagueId: '2', season: SEASON_YEAR, oddsKey: null },

    // Formula 1 + MMA
    { sport: 'formula1', leagueId: null, season: SEASON_YEAR, oddsKey: null },
    { sport: 'mma', leagueId: null, season: SEASON_YEAR, oddsKey: 'mma_mixed_martial_arts' },
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
