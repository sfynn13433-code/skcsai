'use strict';

const { query, withTransaction } = require('../db');
const { validateRawPredictionForInsert } = require('../utils/validation');

function normalizeTier(tier) {
    if (tier === 'normal' || tier === 'deep') return tier;
    throw new Error(`Invalid tier: ${tier}`);
}

async function getTierRules(tier, client) {
    const t = normalizeTier(tier);
    const sql = `
        select
            tier,
            min_confidence,
            allowed_markets,
            max_acca_size,
            allowed_volatility
        from tier_rules
        where tier = $1
        limit 1;
    `;
    const res = await (client ? client.query(sql, [t]) : query(sql, [t]));
    if (!res.rows.length) {
        throw new Error(`Missing tier_rules row for tier=${t}`);
    }

    return res.rows[0];
}

function isMarketAllowed(allowedMarkets, market) {
    if (!allowedMarkets) return false;
    if (Array.isArray(allowedMarkets) && allowedMarkets.length === 1 && allowedMarkets[0] === 'ALL') return true;
    if (!Array.isArray(allowedMarkets)) return false;
    return allowedMarkets.includes(market);
}

function isVolatilityAllowed(allowedVolatility, volatility) {
    if (!allowedVolatility) return false;
    if (!Array.isArray(allowedVolatility)) return false;
    return allowedVolatility.includes(volatility);
}

function buildRejectReason({ tier, reason, raw }) {
    return `[tier=${tier}] ${reason} (confidence=${raw.confidence}, market=${raw.market}, volatility=${raw.volatility})`;
}

function getMetadata(raw) {
    return raw && typeof raw.metadata === 'object' && raw.metadata !== null ? raw.metadata : {};
}

function parseMatchTime(raw) {
    const metadata = getMetadata(raw);
    const value = metadata.match_time || metadata.kickoff || metadata.kickoff_time || null;
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isTestPrediction(raw) {
    const metadata = getMetadata(raw);
    return metadata.data_mode === 'test';
}

function evaluateMetadataQuality(raw, tier) {
    if (isTestPrediction(raw)) {
        return { is_valid: true, reject_reason: null };
    }

    const metadata = getMetadata(raw);
    const predictionSource = String(metadata.prediction_source || '').trim().toLowerCase();
    if (predictionSource !== 'provider') {
        return {
            is_valid: false,
            reject_reason: buildRejectReason({ tier, reason: 'Prediction source is not provider-backed', raw })
        };
    }

    if (typeof metadata.league !== 'string' || metadata.league.trim().length === 0) {
        return {
            is_valid: false,
            reject_reason: buildRejectReason({ tier, reason: 'Missing league metadata', raw })
        };
    }

    const kickoff = parseMatchTime(raw);
    if (!kickoff) {
        return {
            is_valid: false,
            reject_reason: buildRejectReason({ tier, reason: 'Missing or invalid kickoff time', raw })
        };
    }

    const staleCutoff = new Date(Date.now() - 15 * 60 * 1000);
    if (kickoff < staleCutoff) {
        return {
            is_valid: false,
            reject_reason: buildRejectReason({ tier, reason: 'Kickoff time is already in the past', raw })
        };
    }

    return { is_valid: true, reject_reason: null };
}

async function upsertFilteredRow({ rawId, tier, isValid, rejectReason }, client) {
    const sql = `
        insert into predictions_filtered (raw_id, tier, is_valid, reject_reason)
        values ($1, $2, $3, $4)
        on conflict (raw_id, tier)
        do update set
            is_valid = excluded.is_valid,
            reject_reason = excluded.reject_reason,
            created_at = now()
        returning *;
    `;

    const res = await client.query(sql, [rawId, tier, isValid, rejectReason]);
    return res.rows[0];
}

function evaluateRawAgainstTier(raw, rules) {
    const tier = rules.tier;

    if (typeof raw.confidence !== 'number' || Number.isNaN(raw.confidence)) {
        return { is_valid: false, reject_reason: buildRejectReason({ tier, reason: 'Missing or non-numeric confidence', raw }) };
    }

    if (raw.confidence < rules.min_confidence) {
        return { is_valid: false, reject_reason: buildRejectReason({ tier, reason: `Confidence below min_confidence (${rules.min_confidence})`, raw }) };
    }

    if (!isMarketAllowed(rules.allowed_markets, raw.market)) {
        return { is_valid: false, reject_reason: buildRejectReason({ tier, reason: 'Market not allowed by tier_rules', raw }) };
    }

    if (!isVolatilityAllowed(rules.allowed_volatility, raw.volatility)) {
        return { is_valid: false, reject_reason: buildRejectReason({ tier, reason: 'Volatility not allowed by tier_rules', raw }) };
    }

    const metadataGate = evaluateMetadataQuality(raw, tier);
    if (!metadataGate.is_valid) {
        return metadataGate;
    }

    return { is_valid: true, reject_reason: null };
}

async function filterRawPrediction({ rawId, tier }, client) {
    const rules = await getTierRules(tier, client);

    const rawRes = await client.query('select * from predictions_raw where id = $1 limit 1;', [rawId]);
    if (!rawRes.rows.length) {
        throw new Error(`predictions_raw not found for id=${rawId}`);
    }

    const raw = rawRes.rows[0];
    validateRawPredictionForInsert(raw);

    const { is_valid, reject_reason } = evaluateRawAgainstTier(raw, rules);

    const filtered = await upsertFilteredRow({
        rawId,
        tier: rules.tier,
        isValid: is_valid,
        rejectReason: reject_reason
    }, client);

    console.log('[filterEngine] raw_id=%s tier=%s is_valid=%s reason=%s', rawId, rules.tier, is_valid, reject_reason);

    return filtered;
}

async function filterLatestRawBatch({ tier, limit = 500 }) {
    const normalizedTier = normalizeTier(tier);

    return withTransaction(async (client) => {
        const rawRes = await client.query(
            'select id from predictions_raw order by created_at desc limit $1;',
            [limit]
        );

        const filtered = [];
        for (const row of rawRes.rows) {
            const out = await filterRawPrediction({ rawId: row.id, tier: normalizedTier }, client);
            filtered.push(out);
        }
        return filtered;
    });
}

module.exports = {
    getTierRules,
    filterRawPrediction,
    filterLatestRawBatch
};
