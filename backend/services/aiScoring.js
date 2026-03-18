'use strict';

const crypto = require('crypto');

function stableHashToUnitInterval(input) {
    const h = crypto.createHash('sha256').update(String(input)).digest('hex');
    const slice = h.slice(0, 12);
    const n = parseInt(slice, 16);
    return n / 0xFFFFFFFFFFFF;
}

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

function computeTeamStrength(teamName) {
    const u = stableHashToUnitInterval(`team:${teamName || 'unknown'}`);
    // Deterministic pseudo-strength 0..100
    return Math.round(u * 10000) / 100;
}

function scoreMatch(match) {
    if (!match || typeof match !== 'object') {
        throw new Error('aiScoring.scoreMatch requires a match object');
    }

    const home = String(match.home_team || match.homeTeam || '').trim();
    const away = String(match.away_team || match.awayTeam || '').trim();

    const homeStrength = computeTeamStrength(home);
    const awayStrength = computeTeamStrength(away);

    const diff = Math.abs(homeStrength - awayStrength);

    // Deterministic confidence bands
    // strong favorite -> 75-85
    // balanced -> 60-70
    let confidence;
    let volatility;

    if (diff >= 30) {
        confidence = 75 + (diff - 30) * 0.2; // ramps up
        volatility = 'low';
    } else if (diff >= 15) {
        confidence = 68 + (diff - 15) * 0.3;
        volatility = 'medium';
    } else {
        confidence = 60 + diff * 0.5;
        volatility = 'high';
    }

    confidence = clamp(Math.round(confidence * 100) / 100, 0, 100);

    const winner = homeStrength >= awayStrength ? 'home' : 'away';

    console.log('[aiScoring] match_id=%s home=%s away=%s diff=%.2f winner=%s confidence=%.2f volatility=%s',
        match.match_id,
        home || 'N/A',
        away || 'N/A',
        diff,
        winner,
        confidence,
        volatility
    );

    return {
        confidence,
        volatility,
        winner
    };
}

module.exports = {
    scoreMatch
};
