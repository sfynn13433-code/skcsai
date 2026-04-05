'use strict';

function isUpperUnderscore(s) {
    return typeof s === 'string' && /^[A-Z0-9_]+$/.test(s);
}

function assert(condition, message) {
    if (!condition) {
        const err = new Error(message);
        err.name = 'PredictionOutcomesConfigError';
        throw err;
    }
}

function validatePredictionOutcomes(outcomesConfig) {
    assert(outcomesConfig && typeof outcomesConfig === 'object', 'predictionOutcomes must be an object');

    for (const [sport, sportConfig] of Object.entries(outcomesConfig)) {
        if (!sportConfig || typeof sportConfig !== 'object' || !Array.isArray(sportConfig.markets)) {
            continue;
        }
        assert(sportConfig && typeof sportConfig === 'object', `Sport config missing or invalid for sport=${sport}`);
        assert(Array.isArray(sportConfig.markets), `Sport config must contain markets[] for sport=${sport}`);
        assert(sportConfig.markets.length > 0, `Sport must have at least 1 market for sport=${sport}`);

        const seenMarkets = new Set();
        let primaryCount = 0;

        for (const m of sportConfig.markets) {
            assert(m && typeof m === 'object', `Invalid market entry for sport=${sport}`);

            assert(isUpperUnderscore(m.market), `Market name must be uppercase with underscores (sport=${sport} market=${String(m.market)})`);
            assert(!seenMarkets.has(m.market), `Duplicate market name for sport=${sport}: ${m.market}`);
            seenMarkets.add(m.market);

            assert(m.type === 'primary' || m.type === 'secondary' || m.type === 'advanced',
                `Market type must be primary|secondary|advanced (sport=${sport} market=${m.market})`);
            if (m.type === 'primary') primaryCount++;

            assert(Array.isArray(m.outcomes) && m.outcomes.length > 0,
                `Market outcomes must be a non-empty array (sport=${sport} market=${m.market})`);
            for (const o of m.outcomes) {
                assert(typeof o === 'string' && o.trim().length > 0,
                    `Outcome must be a non-empty string (sport=${sport} market=${m.market})`);
            }

            assert(typeof m.description === 'string' && m.description.trim().length > 0,
                `Market description must be a non-empty string (sport=${sport} market=${m.market})`);
        }

        assert(primaryCount > 0, `Sport must have at least 1 primary market (sport=${sport})`);
    }
}

const predictionOutcomes = {
    football: {
        markets: [
            {
                market: 'MATCH_RESULT',
                type: 'primary',
                outcomes: ['HOME', 'DRAW', 'AWAY'],
                description: 'Full time result'
            },
            {
                market: 'DOUBLE_CHANCE',
                type: 'secondary',
                outcomes: ['1X', '12', 'X2'],
                description: 'Two possible outcomes'
            },
            {
                market: 'OVER_UNDER_2_5',
                type: 'primary',
                outcomes: ['OVER', 'UNDER'],
                description: 'Total goals over/under 2.5'
            },
            {
                market: 'BTTS',
                type: 'primary',
                outcomes: ['YES', 'NO'],
                description: 'Both teams to score'
            },
            {
                market: 'OVER_UNDER_1_5',
                type: 'secondary',
                outcomes: ['OVER', 'UNDER'],
                description: 'Safer goals market'
            },
            {
                market: 'CORNERS_OVER_UNDER',
                type: 'advanced',
                outcomes: ['OVER', 'UNDER'],
                description: 'Total corners'
            }
        ]
    },

    basketball: {
        markets: [
            {
                market: 'MATCH_WINNER',
                type: 'primary',
                outcomes: ['HOME', 'AWAY'],
                description: 'Winner of the match (including overtime unless competition rules differ)'
            },
            {
                market: 'TOTAL_POINTS',
                type: 'primary',
                outcomes: ['OVER', 'UNDER'],
                description: 'Total points scored by both teams (line applied later)'
            },
            {
                market: 'HANDICAP',
                type: 'secondary',
                outcomes: ['HOME_COVER', 'AWAY_COVER'],
                description: 'Point spread/handicap cover outcome (line applied later)'
            }
        ]
    },

    tennis: {
        markets: [
            {
                market: 'MATCH_WINNER',
                type: 'primary',
                outcomes: ['PLAYER_1', 'PLAYER_2'],
                description: 'Winner of the match'
            },
            {
                market: 'SET_BETTING',
                type: 'secondary',
                outcomes: ['2-0', '2-1', '0-2', '1-2'],
                description: 'Exact set score in best-of-3 format (extend later for best-of-5)'
            },
            {
                market: 'TOTAL_GAMES',
                type: 'secondary',
                outcomes: ['OVER', 'UNDER'],
                description: 'Total games played (line applied later)'
            }
        ]
    },

    cricket: {
        markets: [
            {
                market: 'MATCH_WINNER',
                type: 'primary',
                outcomes: ['TEAM_1', 'TEAM_2'],
                description: 'Winner of the match (ties/no result handled by rules/provider)'
            },
            {
                market: 'TOTAL_RUNS',
                type: 'primary',
                outcomes: ['OVER', 'UNDER'],
                description: 'Total runs in match/innings (line applied later)'
            }
        ]
    },

    rugby: {
        markets: [
            {
                market: 'MATCH_WINNER',
                type: 'primary',
                outcomes: ['HOME', 'AWAY'],
                description: 'Winner of the match'
            },
            {
                market: 'TOTAL_POINTS',
                type: 'primary',
                outcomes: ['OVER', 'UNDER'],
                description: 'Total points scored by both teams (line applied later)'
            },
            {
                market: 'HANDICAP',
                type: 'secondary',
                outcomes: ['HOME_COVER', 'AWAY_COVER'],
                description: 'Points handicap/spread cover (line applied later)'
            }
        ]
    },

    hockey: {
        markets: [
            {
                market: 'MATCH_WINNER',
                type: 'primary',
                outcomes: ['HOME', 'AWAY'],
                description: 'Winner of the match (including OT/SO depending on provider rules)'
            },
            {
                market: 'TOTAL_GOALS',
                type: 'primary',
                outcomes: ['OVER', 'UNDER'],
                description: 'Total goals scored by both teams (line applied later)'
            }
        ]
    },

    baseball: {
        markets: [
            {
                market: 'MATCH_WINNER',
                type: 'primary',
                outcomes: ['HOME', 'AWAY'],
                description: 'Winner of the match'
            },
            {
                market: 'TOTAL_RUNS',
                type: 'primary',
                outcomes: ['OVER', 'UNDER'],
                description: 'Total runs scored by both teams (line applied later)'
            }
        ]
    },

    american_football: {
        markets: [
            {
                market: 'MATCH_WINNER',
                type: 'primary',
                outcomes: ['HOME', 'AWAY'],
                description: 'Winner of the match'
            },
            {
                market: 'SPREAD',
                type: 'primary',
                outcomes: ['HOME_COVER', 'AWAY_COVER'],
                description: 'Spread cover outcome (line applied later)'
            },
            {
                market: 'TOTAL_POINTS',
                type: 'primary',
                outcomes: ['OVER', 'UNDER'],
                description: 'Total points scored by both teams (line applied later)'
            }
        ]
    },

    combat_sports: {
        markets: [
            {
                market: 'WINNER',
                type: 'primary',
                outcomes: ['FIGHTER_1', 'FIGHTER_2'],
                description: 'Winner of the fight'
            },
            {
                market: 'METHOD',
                type: 'secondary',
                outcomes: ['KO', 'SUBMISSION', 'DECISION'],
                description: 'Method of victory'
            }
        ]
    },

    motorsport: {
        markets: [
            {
                market: 'RACE_WINNER',
                type: 'primary',
                outcomes: ['DRIVER'],
                description: 'Race winner (specific driver outcome determined elsewhere)'
            },
            {
                market: 'PODIUM',
                type: 'secondary',
                outcomes: ['TOP_3'],
                description: 'Podium finish (top 3)'
            },
            {
                market: 'TOP_10',
                type: 'secondary',
                outcomes: ['YES', 'NO'],
                description: 'Finish in top 10 (driver-specific)'
            }
        ]
    },

    esports: {
        markets: [
            {
                market: 'MATCH_WINNER',
                type: 'primary',
                outcomes: ['TEAM_1', 'TEAM_2'],
                description: 'Winner of the match/series'
            },
            {
                market: 'MAP_SCORE',
                type: 'secondary',
                outcomes: ['2-0', '2-1'],
                description: 'Map/series score (format-specific; extend per title later)'
            }
        ]
    },

    volleyball: {
        markets: [
            {
                market: 'MATCH_WINNER',
                type: 'primary',
                outcomes: ['HOME', 'AWAY'],
                description: 'Winner of the match'
            },
            {
                market: 'SET_HANDICAP',
                type: 'secondary',
                outcomes: ['HOME', 'AWAY'],
                description: 'Set handicap cover outcome (line applied later)'
            }
        ]
    },

    table_tennis: {
        markets: [
            {
                market: 'MATCH_WINNER',
                type: 'primary',
                outcomes: ['PLAYER_1', 'PLAYER_2'],
                description: 'Winner of the match'
            }
        ]
    }
};

function getMarketsBySport(sport) {
    return predictionOutcomes[sport?.toLowerCase()] || null;
}

// Attach helper while still exporting a single config object
predictionOutcomes.getMarketsBySport = getMarketsBySport;

// Fail fast if the outcome universe becomes inconsistent
validatePredictionOutcomes(predictionOutcomes);

module.exports = predictionOutcomes;
