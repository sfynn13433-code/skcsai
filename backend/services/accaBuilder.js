'use strict';

const { withTransaction } = require('../db');
const { detectConflicts } = require('../utils/conflictResolver');
const { isValidCombination } = require('./conflictEngine');

function normalizeTier(tier) {
    if (tier === 'normal' || tier === 'deep') return tier;
    throw new Error(`Invalid tier: ${tier}`);
}

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
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

function toLeg(p) {
    return {
        match_id: p.match_id,
        sport: p.sport,
        market: p.market,
        pick: p.prediction,
        confidence: p.confidence,
        volatility: p.volatility,
        odds: p.odds,
        metadata: p.metadata
    };
}

function isSmartCombo(p) {
    return p && p.type === 'SMART_COMBO' && Array.isArray(p.legs);
}

function getKickoffTimeFromMetadata(p) {
    // Optional: allow upstream to place kickoff time in metadata without requiring schema changes.
    const t = p?.metadata?.kickoff || p?.metadata?.kickoff_time || p?.metadata?.match_time || null;
    if (!t) return null;
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d;
}

function withinDays(from, to, days) {
    const ms = days * 24 * 60 * 60 * 1000;
    return Math.abs(to.getTime() - from.getTime()) <= ms;
}

function withinHours(from, to, hours) {
    const ms = hours * 60 * 60 * 1000;
    return Math.abs(to.getTime() - from.getTime()) <= ms;
}

function buildAccaV2({ tier, candidates, now = new Date() }) {
    const t = normalizeTier(tier);
    const list = Array.isArray(candidates) ? candidates.slice() : [];

    // RULES (Phase 2):
    // - 4–6 matches (legs)
    // - Each leg ≥ 70%
    // - Allow max 1 Smart Combo
    // - No duplicate matches
    // - No conflicts
    // - Tier time windows:
    //   - NORMAL: allow multi-day (≤5 days)
    //   - DEEP: same day + kickoff window ≤ 2 hours

    const minLegConfidence = 70;
    const minSize = 4;
    const maxSize = 6;

    // Flatten smart combos into a single "selection" with multiple legs,
    // but count it as ONE combo for the max-1 rule.
    const scored = list
        .map((p) => {
            if (isSmartCombo(p)) {
                const legs = p.legs.map((l) => ({
                    ...l,
                    market: l.market,
                    pick: l.pick,
                    confidence: l.confidence
                }));
                const confidence = typeof p.confidence === 'number' ? p.confidence : computeTotalConfidence(legs);
                return { kind: 'smart_combo', confidence, legs };
            }
            return { kind: 'single', confidence: p.confidence, legs: [toLeg(p)] };
        })
        .filter((x) => typeof x.confidence === 'number' && x.confidence >= minLegConfidence)
        .sort((a, b) => b.confidence - a.confidence);

    const picked = [];
    const usedMatchIds = new Set();
    let smartComboCount = 0;

    for (const item of scored) {
        if (picked.length >= maxSize) break;
        if (item.kind === 'smart_combo') {
            if (smartComboCount >= 1) continue;
        }

        const itemMatchIds = item.legs.map((l) => String(l.match_id || '').trim()).filter(Boolean);
        if (itemMatchIds.length !== item.legs.length) continue;
        if (itemMatchIds.some((id) => usedMatchIds.has(id))) continue;

        // Deep tier: enforce same day + kickoff window (if kickoff available)
        if (t === 'deep') {
            const kickoffs = item.legs.map(getKickoffTimeFromMetadata).filter(Boolean);
            if (kickoffs.length) {
                for (const k of kickoffs) {
                    const sameDay = k.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
                    if (!sameDay) {
                        // Deep must be same day
                        continue;
                    }
                    if (!withinHours(now, k, 2)) {
                        continue;
                    }
                }
            }
        } else {
            // Normal tier: allow within 5 days if kickoff available
            const kickoffs = item.legs.map(getKickoffTimeFromMetadata).filter(Boolean);
            if (kickoffs.length) {
                if (kickoffs.some((k) => !withinDays(now, k, 5))) continue;
            }
        }

        // Conflicts: validate within item + against already picked
        if (!isValidCombination(item.legs)) continue;
        const prospectiveLegs = picked.flatMap((x) => x.legs).concat(item.legs);
        if (!isValidCombination(prospectiveLegs)) continue;

        // Avoid using two markets from same match inside a single ACCA
        // (the "no duplicate matches" rule)
        for (const id of itemMatchIds) usedMatchIds.add(id);
        picked.push(item);
        if (item.kind === 'smart_combo') smartComboCount++;
    }

    if (picked.length < minSize) {
        return {
            ok: false,
            reason: 'not_enough_legs',
            legs: [],
            confidence: 0
        };
    }

    const legs = picked.flatMap((x) => x.legs).slice(0, maxSize);
    const confidence = clamp(computeTotalConfidence(legs), 0, 100);

    return {
        ok: true,
        legs,
        confidence,
        smartComboCount
    };
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

function getMetadata(prediction) {
    return prediction && typeof prediction.metadata === 'object' && prediction.metadata !== null
        ? prediction.metadata
        : {};
}

function parseKickoff(prediction) {
    const metadata = getMetadata(prediction);
    const value = metadata.match_time || metadata.kickoff || metadata.kickoff_time || null;
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isPublishablePrediction(prediction, now = new Date()) {
    const metadata = getMetadata(prediction);

    if (metadata.data_mode === 'test') return true;
    if (String(metadata.prediction_source || '').trim().toLowerCase() !== 'provider') return false;
    if (typeof metadata.league !== 'string' || metadata.league.trim().length === 0) return false;

    const kickoff = parseKickoff(prediction);
    if (!kickoff) return false;

    const staleCutoff = new Date(now.getTime() - 15 * 60 * 1000);
    return kickoff >= staleCutoff;
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

    return res.rows.filter((row) => isPublishablePrediction(row));
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

        // Limit candidates to prevent combinatorial explosion and timeouts
        const MAX_ACCA_CANDIDATES = 30;
        const limitedCandidates = perMatchLimited.slice(0, MAX_ACCA_CANDIDATES);

        await clearFinalForTier(t, client);

        // Build singles from all limited candidates
        const singles = [];
        for (const p of limitedCandidates) {
            const matches = [toFinalMatchPayload(p)];
            const total = computeTotalConfidence(matches);
            const row = await insertFinalRow({
                tier: t, type: 'single', matches, total_confidence: total, risk_level: riskLevelFromConfidence(total)
            }, client);
            singles.push(row);
        }

        // Build ACCAs only if we have reasonable number of low volatility candidates
        const lowVol = limitedCandidates.filter(p => p.volatility === 'low');
        const accas = [];
        const maxAccaSize = Math.min(tierRules.max_acca_size, 3); // Cap at 3 to limit combinations

        // Only build ACCAs if we have 2-10 low volatility candidates
        if (lowVol.length >= 2 && lowVol.length <= 10) {
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

                    if (t === 'deep' && combo.some(p => p.volatility !== 'low')) continue;

                    if (accaRules.no_conflicting_markets) {
                        const { hasConflicts } = detectConflicts(combo);
                        if (hasConflicts) continue;
                    }

                    const matches = combo.map(toFinalMatchPayload);
                    const avg = computeTotalConfidence(matches);
                    const row = await insertFinalRow({
                        tier: t, type: 'acca', matches, total_confidence: avg, risk_level: riskLevelFromConfidence(avg)
                    }, client);
                    accas.push(row);
                }
            }
        }

        console.log('[accaBuilder] tier=%s singles=%s accas=%s', t, singles.length, accas.length);
        return { tier: t, singles, accas };
    });
}

module.exports = { buildFinalForTier, buildAccaV2 };
