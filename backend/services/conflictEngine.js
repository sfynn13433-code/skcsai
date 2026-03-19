'use strict';

function normalizeMarket(market) {
    return String(market || '').trim().toUpperCase();
}

function normalizePick(pick) {
    return String(pick || '').trim().toUpperCase();
}

function isOverUnderMarket(market) {
    return /^OVER_UNDER_\d+_?\d*$/.test(market) || /^TOTAL_(GOALS|POINTS|RUNS|GAMES|POINTS)$/.test(market);
}

function isValidCombination(legs) {
    if (!Array.isArray(legs) || legs.length === 0) return false;

    const seenMarket = new Set();
    const marketToPick = new Map();

    let hasBTTSYes = false;
    let hasBTTSNo = false;
    let hasOver25 = false;
    let hasUnder15 = false;
    let hasOver15 = false;
    let hasUnder25 = false;

    for (const leg of legs) {
        const market = normalizeMarket(leg?.market);
        const pick = normalizePick(leg?.pick);

        if (!market || !pick) return false;

        // Same market duplicated
        if (seenMarket.has(market)) return false;
        seenMarket.add(market);

        // Contradicting outcomes (same market with different pick should never happen due to duplicate check,
        // but keep this for safety if upstream changes to allow multiple lines)
        if (marketToPick.has(market) && marketToPick.get(market) !== pick) return false;
        marketToPick.set(market, pick);

        if (market === 'BTTS') {
            if (pick === 'YES') hasBTTSYes = true;
            if (pick === 'NO') hasBTTSNo = true;
        }

        if (market === 'OVER_UNDER_2_5') {
            if (pick === 'OVER') hasOver25 = true;
            if (pick === 'UNDER') hasUnder25 = true;
        }

        if (market === 'OVER_UNDER_1_5') {
            if (pick === 'OVER') hasOver15 = true;
            if (pick === 'UNDER') hasUnder15 = true;
        }

        // Generic over/under contradiction guard: OVER + UNDER within same market already blocked,
        // but if someone passes two different market codes that represent the same concept,
        // we only enforce the hard rules below.
        if (isOverUnderMarket(market) && pick !== 'OVER' && pick !== 'UNDER' && market.startsWith('OVER_UNDER_')) {
            return false;
        }
    }

    // HARD RULES (as requested)
    // - BTTS YES + UNDER 1.5
    if (hasBTTSYes && hasUnder15) return false;
    // - BTTS NO + OVER 2.5
    if (hasBTTSNo && hasOver25) return false;
    // - UNDER 1.5 + OVER 2.5
    if (hasUnder15 && hasOver25) return false;

    // Extra safety: mutually exclusive BTTS
    if (hasBTTSYes && hasBTTSNo) return false;
    // Extra safety: mutually exclusive O/U 2.5 or 1.5
    if (hasOver25 && hasUnder25) return false;
    if (hasOver15 && hasUnder15) return false;

    return true;
}

module.exports = {
    isValidCombination
};

