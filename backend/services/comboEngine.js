'use strict';

const { isValidCombination } = require('./conflictEngine');

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

function combinedConfidence(legs) {
    if (!Array.isArray(legs) || !legs.length) return 0;
    const avg = legs.reduce((acc, l) => acc + (typeof l.confidence === 'number' ? l.confidence : 0), 0) / legs.length;
    // Placeholder: small correlation penalty for multi-leg
    const penalty = (legs.length - 1) * 2.5;
    return clamp(Math.round((avg - penalty) * 100) / 100, 0, 100);
}

function toLeg(m) {
    return {
        match_id: m.match_id || m.matchId || null,
        market: m.market,
        pick: m.pick,
        confidence: m.confidence,
        sport: m.sport || null
    };
}

function marketKey(market) {
    return String(market || '').toUpperCase();
}

function findBestByMarket(markets, wanted) {
    const w = new Set(wanted.map(marketKey));
    return (Array.isArray(markets) ? markets : [])
        .filter(m => w.has(marketKey(m.market)))
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
}

function legMeetsMin(leg, min = 65) {
    return typeof leg?.confidence === 'number' && leg.confidence >= min;
}

function generateSmartCombos(markets) {
    const candidates = Array.isArray(markets) ? markets : [];

    // Allowed pairings (by market code)
    const PAIRS = [
        ['MATCH_RESULT', 'OVER_UNDER_2_5'],
        ['DOUBLE_CHANCE', 'OVER_UNDER_2_5'],
        ['MATCH_RESULT', 'BTTS'],
        ['DOUBLE_CHANCE', 'BTTS'],
        ['BTTS', 'OVER_UNDER_2_5']
    ];

    const out = [];

    for (const [a, b] of PAIRS) {
        const left = findBestByMarket(candidates, [a])[0];
        const right = findBestByMarket(candidates, [b])[0];
        if (!left || !right) continue;

        const legs = [toLeg(left), toLeg(right)];
        if (!legs.every(l => legMeetsMin(l, 65))) continue;
        if (!isValidCombination(legs)) continue;

        const confidence = combinedConfidence(legs);
        if (confidence < 70) continue;

        out.push({
            type: 'SMART_COMBO',
            legs,
            confidence,
            risk: confidence >= 80 ? 'LOW' : 'MEDIUM'
        });
    }

    // Max 2 combos returned
    return out.sort((x, y) => y.confidence - x.confidence).slice(0, 2);
}

function generateSameMatchBets(markets) {
    const candidates = Array.isArray(markets) ? markets : [];
    const sorted = candidates
        .slice()
        .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));

    const results = [];

    // Build up to 2 bets, each 2–5 legs, greedy by confidence.
    for (let attempt = 0; attempt < 2; attempt++) {
        const legs = [];

        for (const m of sorted) {
            if (legs.length >= 5) break;
            const leg = toLeg(m);
            if (!legMeetsMin(leg, 65)) continue;
            if (legs.some(l => marketKey(l.market) === marketKey(leg.market))) continue;

            const tentative = legs.concat([leg]);
            if (!isValidCombination(tentative)) continue;
            legs.push(leg);
        }

        if (legs.length >= 2 && isValidCombination(legs)) {
            const confidence = combinedConfidence(legs);
            results.push({
                type: 'SAME_MATCH_BET',
                legs,
                confidence,
                risk: confidence >= 80 ? 'LOW' : confidence >= 70 ? 'MEDIUM' : 'HIGH',
                warning: confidence < 65 ? '⚠️ HIGH RISK — Low confidence prediction' : undefined
            });
        }
    }

    return results
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 2);
}

module.exports = {
    generateSmartCombos,
    generateSameMatchBets
};

