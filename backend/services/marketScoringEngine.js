'use strict';

const crypto = require('crypto');
const predictionOutcomes = require('../config/predictionOutcomes');
const { scoreMatch } = require('./aiScoring');

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

function hashToUnit(seed) {
    const hash = crypto.createHash('sha256').update(String(seed)).digest('hex').slice(0, 8);
    return parseInt(hash, 16) / 0xFFFFFFFF;
}

function normalizeSport(sport) {
    const key = String(sport || '').toLowerCase();
    if (key === 'mma') return 'combat_sports';
    if (key === 'formula1') return 'motorsport';
    if (key === 'nfl') return 'american_football';
    return key;
}

function pickFromOutcomes(outcomes, matchData, market, scoring) {
    if (!Array.isArray(outcomes) || outcomes.length === 0) return null;

    const winner = scoring?.winner === 'away' ? 'AWAY' : 'HOME';
    const diff = Number(scoring?.confidence || 50) - 60;
    const balanceSeed = hashToUnit(`${matchData?.match_id || matchData?.home_team || 'home'}:${market}`);

    switch (String(market || '').toUpperCase()) {
        case 'MATCH_RESULT':
            if (diff < 6 && outcomes.includes('DRAW') && balanceSeed < 0.22) return 'DRAW';
            return outcomes.includes(winner) ? winner : outcomes[0];
        case 'MATCH_WINNER':
        case 'WINNER':
            return outcomes.includes(winner) ? winner : outcomes[0];
        case 'DOUBLE_CHANCE':
            return winner === 'HOME' ? '1X' : 'X2';
        case 'BTTS':
            return diff < 10 ? 'YES' : 'NO';
        case 'OVER_UNDER_2_5':
        case 'OVER_UNDER_1_5':
        case 'TOTAL_POINTS':
        case 'TOTAL_GOALS':
        case 'TOTAL_RUNS':
        case 'TOTAL_GAMES':
        case 'CORNERS_OVER_UNDER':
            return balanceSeed >= 0.45 ? 'OVER' : 'UNDER';
        case 'HANDICAP':
        case 'SPREAD':
        case 'SET_HANDICAP':
            return winner === 'HOME' ? outcomes[0] : (outcomes[1] || outcomes[0]);
        case 'METHOD':
            if (diff >= 18 && outcomes.includes('KO')) return 'KO';
            if (diff >= 10 && outcomes.includes('DECISION')) return 'DECISION';
            return outcomes.includes('SUBMISSION') ? 'SUBMISSION' : outcomes[0];
        case 'SET_BETTING':
        case 'MAP_SCORE':
            return diff >= 12 ? outcomes[0] : (outcomes[1] || outcomes[0]);
        case 'RACE_WINNER':
            return outcomes[0];
        case 'PODIUM':
            return outcomes.includes('TOP_3') ? 'TOP_3' : outcomes[0];
        case 'TOP_10':
            return balanceSeed >= 0.3 ? 'YES' : 'NO';
        default:
            return outcomes[0];
    }
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
    const sport = normalizeSport(matchData?.sport);
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
        const pick = pickFromOutcomes(m.outcomes, matchData, m.market, scoring);
        const penalty = marketTypePenalty(m.type);
        const marketBias = hashToUnit(`${matchData?.match_id || matchData?.home_team || 'match'}:${m.market}`);
        const confidence = clamp(Math.round((baseConfidence - penalty - (marketBias * 4 - 2)) * 100) / 100, 0, 100);

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
