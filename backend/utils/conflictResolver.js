'use strict';

// Conflict logic is deterministic and blocks ACCA creation when any conflict is present.

const MARKET_CONFLICTS = [
    ['over_2_5', 'under_2_5'],
    ['btts_yes', 'btts_no']
];

function toKey(matchId, market) {
    return `${matchId}::${market}`;
}

function areMarketsConflicting(marketA, marketB) {
    if (!marketA || !marketB) return false;
    if (marketA === marketB) return false;
    for (const [a, b] of MARKET_CONFLICTS) {
        if ((marketA === a && marketB === b) || (marketA === b && marketB === a)) return true;
    }
    return false;
}

function detectConflicts(predictions) {
    // Each prediction is expected to include match_id and market
    const conflicts = [];
    const seenMatch = new Set();
    const perMatchMarkets = new Map();
    const seenExact = new Set();

    for (const p of predictions) {
        if (!p || !p.match_id) {
            conflicts.push({ type: 'invalid_input', message: 'Prediction missing match_id' });
            continue;
        }

        const exactKey = toKey(p.match_id, p.market);
        if (seenExact.has(exactKey)) {
            conflicts.push({
                type: 'duplicate_market',
                match_id: p.match_id,
                market: p.market,
                message: 'Same match+market appears more than once'
            });
        }
        seenExact.add(exactKey);

        if (seenMatch.has(p.match_id)) {
            // This is not always an error (you might have multiple markets per match in input),
            // but for ACCAs we enforce max_per_match=1.
            conflicts.push({
                type: 'duplicate_match',
                match_id: p.match_id,
                message: 'Same match used more than once'
            });
        }
        seenMatch.add(p.match_id);

        const existing = perMatchMarkets.get(p.match_id) || [];
        for (const m of existing) {
            if (areMarketsConflicting(m, p.market)) {
                conflicts.push({
                    type: 'conflicting_markets',
                    match_id: p.match_id,
                    market_a: m,
                    market_b: p.market,
                    message: 'Conflicting markets detected for the same match'
                });
            }
        }
        existing.push(p.market);
        perMatchMarkets.set(p.match_id, existing);
    }

    return {
        hasConflicts: conflicts.length > 0,
        conflicts
    };
}

module.exports = {
    areMarketsConflicting,
    detectConflicts
};
