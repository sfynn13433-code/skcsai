'use strict';

const { withTransaction } = require('../db');
const { detectConflicts } = require('../utils/conflictResolver');

function normalizeTier(tier) {
    if (tier === 'normal' || tier === 'deep') return tier;
    throw new Error(`Invalid tier: ${tier}`);
}

function computeTotalConfidence(predictions) {
    if (!predictions.length) return 0;
    const sum = predictions.reduce((acc, p) => acc + (typeof p.confidence === 'number' ? p.confidence : 0), 0);
    return Math.round((sum / predictions.length) * 100) / 100;
}

function riskLevelFromConfidence(avgConfidence) {
    if (avgConfidence >= 80) return 'safe';
    if (avgConfidence >= 70) return 'medium';
    return 'medium';
}

function combinations(arr, k) {
    const out = [];
    function rec(start, picked) {
        if (picked.length === k) {
            out.push(picked.slice());
            return;
        }
        for (let i = start; i < arr.length; i++) {
            picked.push(arr[i]);
            rec(i + 1, picked);
            picked.pop();
        }
    }
    rec(0, []);
    return out;
}

async function getTierRules(tier, client) {
    const t = normalizeTier(tier);
    const res = await client.query(
        `select tier, min_confidence, allowed_markets, max_acca_size, allowed_volatility from tier_rules where tier = $1 limit 1;`,
        [t]
    );
    if (!res.rows.length) throw new Error(`Missing tier_rules for tier=${t}`);
    return res.rows[0];
}

async function getAccaRules(client) {
    const res = await client.query('select rule_name, rule_value from acca_rules;');
    const rules = {};
    for (const row of res.rows) {
        rules[row.rule_name] = row.rule_value;
    }

    return {
        no_same_match: rules.no_same_match !== undefined ? rules.no_same_match : true,
        no_conflicting_markets: rules.no_conflicting_markets !== undefined ? rules.no_conflicting_markets : true,
        max_per_match: rules.max_per_match !== undefined ? rules.max_per_match : 1,
        allow_high_volatility: rules.allow_high_volatility !== undefined ? rules.allow_high_volatility : false
    };
}

function toFinalMatchPayload(p) {
    return {
        raw_id: p.raw_id,
        match_id: p.match_id,
        sport: p.sport,
        market: p.market,
        prediction: p.prediction,
        confidence: p.confidence,
        volatility: p.volatility,
        odds: p.odds,
        metadata: p.metadata
    };
}

function enforcePerMatchLimit(predictions, maxPerMatch) {
    const counts = new Map();
    const out = [];

    for (const p of predictions) {
        const key = p.match_id;
        const c = counts.get(key) || 0;
        if (c >= maxPerMatch) continue;
        counts.set(key, c + 1);
        out.push(p);
    }

    return out;
}

async function loadValidFilteredPredictions(tier, client) {
    const t = normalizeTier(tier);

    const res = await client.query(
        `
        select
            f.raw_id,
            f.tier,
            r.match_id,
            r.sport,
            r.market,
            r.prediction,
            r.confidence,
            r.volatility,
            r.odds,
            r.metadata,
            r.created_at
        from predictions_filtered f
        join predictions_raw r on r.id = f.raw_id
        where f.tier = $1 and f.is_valid = true
        order by r.confidence desc, r.created_at desc;
        `,
        [t]
    );

    return res.rows;
}

async function clearFinalForTier(tier, client) {
    const t = normalizeTier(tier);
    await client.query('delete from predictions_final where tier = $1;', [t]);
}

async function insertFinalRow({ tier, type, matches, total_confidence, risk_level }, client) {
    const res = await client.query(
        `
        insert into predictions_final (tier, type, matches, total_confidence, risk_level)
        values ($1, $2, $3::jsonb, $4, $5)
        returning *;
        `,
        [tier, type, JSON.stringify(matches), total_confidence, risk_level]
    );

    return res.rows[0];
}

async function buildFinalForTier(tier) {
    const t = normalizeTier(tier);

    return withTransaction(async (client) => {
        const tierRules = await getTierRules(t, client);
        const accaRules = await getAccaRules(client);

        const valid = await loadValidFilteredPredictions(t, client);
        const perMatchLimited = enforcePerMatchLimit(valid, accaRules.max_per_match);

        await clearFinalForTier(t, client);

        const singles = [];
        for (const p of perMatchLimited) {
            const matches = [toFinalMatchPayload(p)];
            const total = computeTotalConfidence(matches);
            const row = await insertFinalRow({
                tier: t,
                type: 'single',
                matches,
                total_confidence: total,
                risk_level: riskLevelFromConfidence(total)
            }, client);
            singles.push(row);
        }

        const lowVol = perMatchLimited.filter(p => p.volatility === 'low');

        const maxAccaSize = tierRules.max_acca_size;
        const accas = [];

        // Build deterministic ACCAs: we generate combinations starting from size=2 up to maxAccaSize.
        // For deep tier, low volatility is already enforced above.
        for (let size = 2; size <= maxAccaSize; size++) {
            const combos = combinations(lowVol, size);
            for (const combo of combos) {
                if (!combo.length) continue;

                if (accaRules.no_same_match) {
                    const matchIds = combo.map(p => p.match_id);
                    const set = new Set(matchIds);
                    if (set.size !== matchIds.length) continue;
                }

                if (!accaRules.allow_high_volatility) {
                    if (combo.some(p => p.volatility === 'high')) continue;
                }

                // Deep tier rejects medium volatility (spec)
                if (t === 'deep' && combo.some(p => p.volatility !== 'low')) continue;

                if (accaRules.no_conflicting_markets) {
                    const { hasConflicts } = detectConflicts(combo);
                    if (hasConflicts) continue;
                }

                const matches = combo.map(toFinalMatchPayload);
                const avg = computeTotalConfidence(matches);
                const row = await insertFinalRow({
                    tier: t,
                    type: 'acca',
                    matches,
                    total_confidence: avg,
                    risk_level: riskLevelFromConfidence(avg)
                }, client);

                accas.push(row);
            }
        }

        console.log('[accaBuilder] tier=%s singles=%s accas=%s', t, singles.length, accas.length);

        return {
            tier: t,
            singles,
            accas
        };
    });
}

module.exports = {
    buildFinalForTier
};
