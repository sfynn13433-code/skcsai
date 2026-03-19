'use strict';

const { isValidCombination } = require('./conflictEngine');
const { scoreMarkets } = require('./marketScoringEngine');

function parseDate(d) {
    const x = d instanceof Date ? d : new Date(d);
    return Number.isNaN(x.getTime()) ? null : x;
}

function hoursUntil(kickoff) {
    const k = parseDate(kickoff);
    if (!k) return null;
    return (k.getTime() - Date.now()) / (1000 * 60 * 60);
}

function reEvaluatePredictions(predictions) {
    const input = Array.isArray(predictions) ? predictions : [];
    const out = [];

    for (const p of input) {
        // Expecting shape like:
        // { matchData, tier, selection: { legs: [{market,pick,confidence}] } }
        // This is intentionally permissive to avoid breaking existing callers.
        const kickoff = p?.matchData?.kickoff || p?.matchData?.kickoff_time || p?.kickoff || p?.matchTime;
        const h = hoursUntil(kickoff);

        // Only apply deep-tier reevaluation within 2h window (as spec).
        const tier = String(p?.tier || '').toLowerCase();
        const shouldRecheck = tier === 'deep' && h !== null && h <= 2 && h >= -0.5;

        if (!shouldRecheck) {
            out.push(p);
            continue;
        }

        const selection = p?.selection || p;
        const legs = Array.isArray(selection?.legs) ? selection.legs : [];

        // Re-check conflicts
        if (legs.length && !isValidCombination(legs)) {
            out.push({ ...p, action: 'REMOVE', reason: 'conflict_detected' });
            continue;
        }

        // Re-score markets using placeholder scoring, then decide whether to keep/switch/remove
        const matchData = p?.matchData || p?.match || null;
        const rescored = matchData ? scoreMarkets(matchData) : [];

        // If confidence < 65 -> remove OR fallback (placeholder: attempt fallback to best market >= 65)
        const currentConfidence = typeof selection?.confidence === 'number'
            ? selection.confidence
            : (legs.length ? legs.reduce((acc, l) => acc + (l.confidence || 0), 0) / legs.length : null);

        if (typeof currentConfidence === 'number' && currentConfidence < 65) {
            const best = rescored
                .filter(m => typeof m.confidence === 'number' && m.confidence >= 65)
                .sort((a, b) => b.confidence - a.confidence)[0];

            if (!best) {
                out.push({ ...p, action: 'REMOVE', reason: 'confidence_below_65' });
            } else {
                out.push({
                    ...p,
                    action: 'SWITCH',
                    reason: 'confidence_below_65_fallback_available',
                    switchedTo: { market: best.market, pick: best.pick, confidence: best.confidence }
                });
            }
            continue;
        }

        // If better option exists -> replace (placeholder: pick higher confidence by +5 margin)
        const best = rescored
            .filter(m => typeof m.confidence === 'number')
            .sort((a, b) => b.confidence - a.confidence)[0];

        if (best && typeof currentConfidence === 'number' && best.confidence >= currentConfidence + 5) {
            out.push({
                ...p,
                action: 'REPLACE',
                reason: 'better_option_found',
                replacedWith: { market: best.market, pick: best.pick, confidence: best.confidence }
            });
            continue;
        }

        out.push({ ...p, action: 'KEEP' });
    }

    return out;
}

module.exports = {
    reEvaluatePredictions
};

