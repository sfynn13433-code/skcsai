'use strict';

const predictionOutcomes = require('../config/predictionOutcomes');
const { scoreMatch } = require('./aiScoring');

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

function pickFromOutcomes(outcomes) {
    // Placeholder deterministic pick: first outcome
    return Array.isArray(outcomes) && outcomes.length ? outcomes[0] : null;
}

function marketTypePenalty(type) {
    if (type === 'primary') return 0;
    if (type === 'secondary') return 3;
    return 6; // advanced
}

function outcomeUniverseToLegacyMarket(sport, market) {
    // We keep outcome universe identifiers as primary source of truth,
    // but provide a pragmatic alias to the current pipeline naming where obvious.
    const s = String(sport || '').toLowerCase();
    const m = String(market || '').toUpperCase();

    if (s === 'football' && m === 'MATCH_RESULT') return '1X2';
    if (s === 'football' && m === 'DOUBLE_CHANCE') return 'double_chance';
    if (s === 'football' && m === 'BTTS') return 'btts_yes/btts_no';
    if (s === 'football' && m === 'OVER_UNDER_2_5') return 'over_2_5/under_2_5';
    if (s === 'football' && m === 'OVER_UNDER_1_5') return 'over_1_5/under_1_5';

    return null;
}

function scoreMarkets(matchData) {
    const sport = String(matchData?.sport || '').toLowerCase();
    const sportConfig = predictionOutcomes.getMarketsBySport(sport);
    if (!sportConfig) return [];

    const scoring = scoreMatch({
        match_id: matchData?.match_id || matchData?.matchId || null,
        sport,
        home_team: matchData?.home_team || matchData?.homeTeam || null,
        away_team: matchData?.away_team || matchData?.awayTeam || null
    });

    const baseConfidence = typeof scoring?.confidence === 'number' ? scoring.confidence : 50;

    return sportConfig.markets.map((m) => {
        const pick = pickFromOutcomes(m.outcomes);
        const penalty = marketTypePenalty(m.type);
        const confidence = clamp(Math.round((baseConfidence - penalty) * 100) / 100, 0, 100);

        return {
            market: m.market,
            pick,
            confidence,
            type: m.type,
            description: m.description,
            legacyMarketHint: outcomeUniverseToLegacyMarket(sport, m.market)
        };
    });
}

module.exports = {
    scoreMarkets
};

