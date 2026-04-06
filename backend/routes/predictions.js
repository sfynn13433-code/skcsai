'use strict';

const express = require('express');
const { query } = require('../db');
const { rebuildFinalOutputs } = require('../services/aiPipeline');
const { requireRole } = require('../utils/auth');
const config = require('../config');
const { createClient } = require('@supabase/supabase-js');

const { getPlanCapabilities, filterPredictionsForPlan, calculateDailyAllocations } = require('../config/subscriptionMatrix');
const { getPredictionWindow } = require('../utils/dateNormalization');

const router = express.Router();

const SPORT_FILTER_MAP = {
    football: [
        'football',
        'soccer_epl',
        'soccer_england_efl_cup',
        'soccer_uefa_champs_league',
        'soccer_spain_la_liga',
        'soccer_germany_bundesliga',
        'soccer_italy_serie_a',
        'soccer_france_ligue_one',
        'soccer_uefa_europa_league'
    ],
    basketball: ['basketball', 'nba', 'basketball_nba', 'basketball_euroleague'],
    nfl: ['nfl', 'american_football', 'americanfootball_nfl'],
    rugby: ['rugby', 'rugbyunion_international', 'rugbyunion_six_nations'],
    hockey: ['hockey', 'icehockey_nhl'],
    baseball: ['baseball', 'baseball_mlb'],
    afl: ['afl', 'aussierules_afl'],
    mma: ['mma', 'mma_mixed_martial_arts'],
    formula1: ['formula1'],
    handball: ['handball'],
    volleyball: ['volleyball'],
    cricket: ['cricket']
};

function normalizePredictionSportKey(value) {
    const key = String(value || '').trim().toLowerCase();
    if (!key) return 'unknown';
    if (key.startsWith('soccer_')) return 'football';
    if (key.startsWith('icehockey_')) return 'hockey';
    if (key.startsWith('basketball_')) return 'basketball';
    if (key.startsWith('americanfootball_')) return 'nfl';
    if (key.startsWith('baseball_')) return 'baseball';
    if (key.startsWith('rugbyunion_')) return 'rugby';
    if (key.startsWith('aussierules_')) return 'afl';
    if (key.startsWith('mma_')) return 'mma';
    return key;
}

function getSportFilterValues(sport) {
    const key = String(sport || '').trim().toLowerCase();
    if (!key) return [];
    return SPORT_FILTER_MAP[key] || [key];
}

function predictionMatchesSport(prediction, sportFilterValues) {
    if (!Array.isArray(sportFilterValues) || sportFilterValues.length === 0) return true;
    const allowed = new Set(sportFilterValues.map(normalizePredictionSportKey));
    const matches = Array.isArray(prediction?.matches) ? prediction.matches : [];
    if (matches.length === 0) return false;
    return matches.every((match) => allowed.has(normalizePredictionSportKey(match?.sport || '')));
}

function extractTeamNames(predictions) {
    const names = new Set();
    for (const row of predictions) {
        const matches = Array.isArray(row.matches) ? row.matches : [];
        for (const m of matches) {
            const home = m?.home_team || m?.metadata?.home_team || null;
            const away = m?.away_team || m?.metadata?.away_team || null;
            if (home && String(home).trim()) names.add(String(home).trim());
            if (away && String(away).trim()) names.add(String(away).trim());
        }
    }
    return Array.from(names);
}

function buildPlayersByTeam(rows) {
    const map = new Map();
    for (const row of rows) {
        if (!map.has(row.team_id)) map.set(row.team_id, []);
        const list = map.get(row.team_id);
        if (list.length >= 3) continue;
        list.push({
            id: row.id,
            name: row.name,
            position: row.position,
            number: row.number,
            age: row.age,
            photo: row.photo
        });
    }
    return map;
}

function formatUtcDateTime(value) {
    if (!value) return '';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return String(value);
    const day = String(parsed.getUTCDate()).padStart(2, '0');
    const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const year = String(parsed.getUTCFullYear()).slice(-2);
    const hours = String(parsed.getUTCHours()).padStart(2, '0');
    const minutes = String(parsed.getUTCMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function humanizeToken(value) {
    return String(value || '')
        .trim()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function humanizePredictionLabel(prediction, market) {
    const normalized = String(prediction || '').trim().toLowerCase();
    const marketKey = String(market || '').trim().toLowerCase();
    const explicit = {
        home_win: 'HOME WIN',
        away_win: 'AWAY WIN',
        draw: 'DRAW',
        over: 'OVER',
        under: 'UNDER',
        yes: 'YES',
        no: 'NO',
        '1x': 'DOUBLE CHANCE - 1X',
        x2: 'DOUBLE CHANCE - X2',
        '12': 'DOUBLE CHANCE - 12'
    };

    if (explicit[normalized]) return explicit[normalized];
    if (marketKey.includes('double_chance')) return `DOUBLE CHANCE - ${String(prediction || '').toUpperCase()}`;
    if (marketKey.includes('over') || marketKey.includes('under')) {
        const marketLabel = humanizeToken(marketKey.replace(/\//g, ' / ')).toUpperCase();
        return `${String(prediction || '').toUpperCase()} ${marketLabel}`.trim();
    }
    return humanizeToken(prediction).toUpperCase() || 'PREDICTION';
}

function humanizeProductType(type) {
    const normalized = String(type || '').trim().toLowerCase();
    if (normalized === 'same_match') return 'Same Match Builder';
    if (normalized === 'acca_6match') return '6-Match ACCA';
    if (normalized === 'multi') return 'Multi';
    if (normalized === 'secondary') return 'Secondary';
    if (normalized === 'direct') return 'Direct';
    return humanizeToken(type) || 'Prediction';
}

function humanizeMarketLabel(market) {
    const normalized = String(market || '').trim().toLowerCase();
    const aliases = {
        '1x2': '1X2',
        match_result: 'Match Result',
        double_chance: 'Double Chance',
        over_1_5: 'Over 1.5 Goals',
        under_1_5: 'Under 1.5 Goals',
        over_1_5_under_1_5: 'Over / Under 1.5',
        'over_1_5/under_1_5': 'Over / Under 1.5',
        over_2_5: 'Over 2.5 Goals',
        under_2_5: 'Under 2.5 Goals',
        btts_yes: 'BTTS - Yes',
        btts_no: 'BTTS - No'
    };
    return aliases[normalized] || humanizeToken(normalized);
}

function buildHeaderInfo(match) {
    const metadata = match?.metadata || {};
    const formatted = formatUtcDateTime(
        match?.commence_time ||
        match?.match_date ||
        metadata.match_time ||
        metadata.kickoff ||
        metadata.kickoff_time ||
        null
    );
    const league = metadata.league || metadata.tournament || humanizeToken(match?.sport || 'football');
    return `${normalizePredictionSportKey(match?.sport || 'football').toUpperCase()}${formatted ? ` • ${formatted}` : ''}${league ? ` • ${league}` : ''}`;
}

function buildStageOneBaseline(prediction, confidence) {
    const safeConfidence = Math.max(35, Math.min(95, Math.round(Number(confidence) || 60)));
    const remainder = Math.max(5, 100 - safeConfidence);

    if (prediction === 'home_win') {
        const draw = Math.max(8, Math.round(remainder * 0.45));
        return { home: safeConfidence, draw, away: Math.max(5, 100 - safeConfidence - draw) };
    }
    if (prediction === 'away_win') {
        const draw = Math.max(8, Math.round(remainder * 0.45));
        return { home: Math.max(5, 100 - safeConfidence - draw), draw, away: safeConfidence };
    }
    if (prediction === 'draw') {
        const home = Math.max(10, Math.round(remainder * 0.5));
        return { home, draw: safeConfidence, away: Math.max(5, 100 - safeConfidence - home) };
    }

    const split = Math.max(10, Math.round(remainder / 2));
    return { home: split, draw: Math.max(10, 100 - safeConfidence - split), away: safeConfidence };
}

function buildFallbackPipeline({ prediction, metadata, type, tier }) {
    const selectionLabel = humanizePredictionLabel(prediction?.prediction, prediction?.market);
    const marketLabel = humanizeMarketLabel(prediction?.market);
    const productLabel = humanizeProductType(type);
    const kickoff = prediction?.commence_time || prediction?.match_date || metadata.match_time || null;
    const confidence = Math.round(Number(prediction?.confidence) || Number(prediction?.total_confidence) || 60);
    const baseline = buildStageOneBaseline(prediction?.prediction, confidence);
    const league = metadata.league || metadata.tournament || humanizeToken(prediction?.sport || 'football');
    const provider = metadata.provider || 'provider';
    const bookmaker = metadata.bookmaker || 'market source';
    const volatility = String(prediction?.volatility || metadata.volatility || 'medium').trim().toLowerCase();
    const volatilityLabel = volatility ? humanizeToken(volatility) : 'Medium';
    const kickoffText = kickoff ? formatUtcDateTime(kickoff) : 'kickoff pending';
    const home = prediction?.home_team || metadata.home_team || 'Home Team';
    const away = prediction?.away_team || metadata.away_team || 'Away Team';

    const existing = metadata.pipeline_data && typeof metadata.pipeline_data === 'object'
        ? metadata.pipeline_data
        : {};
    const elite = existing.elite_6_stage && typeof existing.elite_6_stage === 'object'
        ? existing.elite_6_stage
        : {};
    const core = existing.core_4_stage && typeof existing.core_4_stage === 'object'
        ? existing.core_4_stage
        : {};

    return {
        ...existing,
        elite_6_stage: {
            stage_1_collection: elite.stage_1_collection || `${provider.toUpperCase()} data normalized for ${home} vs ${away}.`,
            stage_2_baseline: elite.stage_2_baseline || `${selectionLabel} leads the baseline model at ${confidence}% on ${marketLabel}.`,
            stage_3_context: elite.stage_3_context || `${league} context loaded for ${kickoffText}.`,
            stage_4_reality: elite.stage_4_reality || `${volatilityLabel} volatility profile using ${bookmaker}.`,
            stage_5_decision: elite.stage_5_decision || `${productLabel} suitability checked against confidence and risk controls.`,
            stage_6_final: elite.stage_6_final || `${productLabel} final call: ${selectionLabel}.`
        },
        core_4_stage: {
            stage_1_baseline: core.stage_1_baseline || `${selectionLabel} baseline edge at ${confidence}%.`,
            stage_2_context: core.stage_2_context || `${league} context applied for ${kickoffText}.`,
            stage_3_reality: core.stage_3_reality || `${volatilityLabel} volatility with ${provider.toUpperCase()} provider support.`,
            stage_4_final: core.stage_4_final || `${productLabel} final lean: ${selectionLabel}.`
        },
        stage_1_baseline: existing.stage_1_baseline || baseline,
        stage_2_context: existing.stage_2_context || `${league} • ${kickoffText}`,
        stage_3_reality: existing.stage_3_reality || {
            weather: metadata.weather || 'Weather data unavailable',
            volatility: volatilityLabel
        },
        stage_4_decision: existing.stage_4_decision || {
            acca_safe: type === 'acca_6match' || (confidence >= 72 && volatility !== 'high'),
            is_1x2_safe: confidence >= 60,
            is_multi_safe: confidence >= 55
        },
        active_tier_process: tier === 'deep' ? 'elite_6_stage' : 'core_4_stage'
    };
}

function buildFallbackReasoning({ prediction, metadata, type }) {
    const selectionLabel = humanizePredictionLabel(prediction?.prediction, prediction?.market);
    const marketLabel = humanizeMarketLabel(prediction?.market);
    const productLabel = humanizeProductType(type);
    const confidence = Math.round(Number(prediction?.confidence) || Number(prediction?.total_confidence) || 60);
    const league = metadata.league || metadata.tournament || humanizeToken(prediction?.sport || 'football');
    const home = prediction?.home_team || metadata.home_team || 'Home Team';
    const away = prediction?.away_team || metadata.away_team || 'Away Team';
    return `${productLabel} angle on ${home} vs ${away}: ${selectionLabel} rates at ${confidence}% on ${marketLabel} after ${league} context checks.`;
}

function enrichMatchMetadata(match, predictionRow) {
    const metadata = match && typeof match.metadata === 'object' && match.metadata !== null
        ? match.metadata
        : {};
    const reasoning = String(
        metadata.reasoning ||
        metadata.core_reasoning ||
        buildFallbackReasoning({
            prediction: match,
            metadata,
            type: predictionRow?.type || predictionRow?.section_type
        })
    ).trim();
    const coreReasoning = String(metadata.core_reasoning || reasoning).trim();
    const pipelineData = buildFallbackPipeline({
        prediction: match,
        metadata,
        type: predictionRow?.type || predictionRow?.section_type,
        tier: predictionRow?.tier
    });

    return {
        ...match,
        metadata: {
            ...metadata,
            predicted_outcome: metadata.predicted_outcome || humanizePredictionLabel(match?.prediction, match?.market),
            reasoning,
            core_reasoning: coreReasoning,
            pipeline_data: pipelineData,
            header_info: metadata.header_info || buildHeaderInfo(match),
            event_id: metadata.event_id || metadata.fixture_id || match?.match_id || null
        }
    };
}

function enrichPredictionDetails(prediction) {
    const matches = Array.isArray(prediction?.matches) ? prediction.matches : [];
    const firstMatch = matches[0] || {};
    const firstMeta = firstMatch.metadata || {};
    const existing = prediction?.prediction_details;
    if (existing && existing.outcome && existing.reasoning) return prediction;

    const type = String(prediction?.type || prediction?.section_type || '').toLowerCase();
    const fallbackOutcome =
        (firstMeta.prediction_details && firstMeta.prediction_details.outcome) ||
        (type === 'acca' || type === 'acca_6match' ? '6-Match ACCA' :
            type === 'same_match' ? 'Same Match Builder' :
                type === 'multi' ? 'Multi Bet' :
                type === 'secondary' ? humanizeMarketLabel(firstMatch.market || 'secondary') :
                    (humanizePredictionLabel(firstMatch.prediction, firstMatch.market) || firstMeta.predicted_outcome || 'Prediction'));
    const fallbackReasoning =
        (firstMeta.prediction_details && firstMeta.prediction_details.reasoning) ||
        firstMeta.reasoning ||
        buildFallbackReasoning({
            prediction: firstMatch,
            metadata: firstMeta,
            type
        });

    return {
        ...prediction,
        prediction_details: {
            outcome: fallbackOutcome,
            reasoning: fallbackReasoning
        }
    };
}

// GET /api/predictions
// Default tier = deep (elite pool); subscription limits use /api/user/predictions
router.get('/', requireRole('user'), async (req, res) => {
    try {
        // NEW: Use subscription matrix instead of tier
        const planId = req.query.plan_id || 'elite_30day_deep_vip';
        const sport = req.query.sport;
        const sportFilterValues = getSportFilterValues(sport);

        console.log(`[PREDICTIONS] Request for Plan: ${planId}, Sport: ${sport || 'all'}`);

        // Get plan capabilities from subscription matrix
        const planCapabilities = getPlanCapabilities(planId);
        if (!planCapabilities) {
            return res.status(400).json({ error: 'Invalid plan ID' });
        }

        let queryStr = `
            WITH latest_runs AS (
                SELECT DISTINCT ON (sport_key)
                    sport_key,
                    publish_run_id
                FROM (
                    SELECT
                        CASE
                            WHEN LOWER(COALESCE(pf.matches->0->>'sport', '')) LIKE 'soccer\_%' THEN 'football'
                            WHEN LOWER(COALESCE(pf.matches->0->>'sport', '')) LIKE 'icehockey\_%' THEN 'hockey'
                            WHEN LOWER(COALESCE(pf.matches->0->>'sport', '')) LIKE 'basketball\_%' THEN 'basketball'
                            WHEN LOWER(COALESCE(pf.matches->0->>'sport', '')) LIKE 'americanfootball\_%' THEN 'nfl'
                            WHEN LOWER(COALESCE(pf.matches->0->>'sport', '')) LIKE 'baseball\_%' THEN 'baseball'
                            WHEN LOWER(COALESCE(pf.matches->0->>'sport', '')) LIKE 'rugbyunion\_%' THEN 'rugby'
                            WHEN LOWER(COALESCE(pf.matches->0->>'sport', '')) LIKE 'aussierules\_%' THEN 'afl'
                            WHEN LOWER(COALESCE(pf.matches->0->>'sport', '')) LIKE 'mma\_%' THEN 'mma'
                            ELSE LOWER(COALESCE(pf.matches->0->>'sport', 'unknown'))
                        END AS sport_key,
                        pf.publish_run_id,
                        COALESCE(pr.completed_at, pr.started_at, pf.created_at) AS run_completed_at
                    FROM predictions_final pf
                    LEFT JOIN prediction_publish_runs pr ON pr.id = pf.publish_run_id
                    WHERE pf.publish_run_id IS NOT NULL
                ) ranked
                ORDER BY sport_key, run_completed_at DESC, publish_run_id DESC
            )
            SELECT pf.id, pf.publish_run_id, pf.tier, pf.type, pf.matches, pf.total_confidence, pf.risk_level, pf.created_at
            FROM predictions_final pf
            JOIN latest_runs lr
              ON lr.publish_run_id = pf.publish_run_id
             AND (
                CASE
                    WHEN LOWER(COALESCE(pf.matches->0->>'sport', '')) LIKE 'soccer\_%' THEN 'football'
                    WHEN LOWER(COALESCE(pf.matches->0->>'sport', '')) LIKE 'icehockey\_%' THEN 'hockey'
                    WHEN LOWER(COALESCE(pf.matches->0->>'sport', '')) LIKE 'basketball\_%' THEN 'basketball'
                    WHEN LOWER(COALESCE(pf.matches->0->>'sport', '')) LIKE 'americanfootball\_%' THEN 'nfl'
                    WHEN LOWER(COALESCE(pf.matches->0->>'sport', '')) LIKE 'baseball\_%' THEN 'baseball'
                    WHEN LOWER(COALESCE(pf.matches->0->>'sport', '')) LIKE 'rugbyunion\_%' THEN 'rugby'
                    WHEN LOWER(COALESCE(pf.matches->0->>'sport', '')) LIKE 'aussierules\_%' THEN 'afl'
                    WHEN LOWER(COALESCE(pf.matches->0->>'sport', '')) LIKE 'mma\_%' THEN 'mma'
                    ELSE LOWER(COALESCE(pf.matches->0->>'sport', 'unknown'))
                END
             ) = lr.sport_key
            WHERE tier IN (${planCapabilities.tiers.map(t => `'${t}'`).join(',')})
        `;
        const queryParams = [];

        if (sportFilterValues.length > 0) {
            queryStr += ` AND EXISTS (
                SELECT 1 FROM jsonb_array_elements(matches) AS m 
                WHERE LOWER(m->>'sport') = ANY($1::text[])
            )`;
            queryParams.push(sportFilterValues);
        }

        queryStr += ` ORDER BY created_at DESC LIMIT 400;`;

        const dbRes = await query(queryStr, queryParams);
        let predictions = dbRes.rows || [];

        // If DB returned no predictions, attempt Supabase fallback (useful when Supabase is the source)
        try {
            if ((!predictions || predictions.length === 0) && config.supabase && config.supabase.url && config.supabase.anonKey) {
                console.log('[predictions] DB empty - attempting Supabase fallback');
                const sb = createClient(config.supabase.url, config.supabase.anonKey);
                const { data, error } = await sb.from('predictions_final').select('*').order('created_at', { ascending: false }).limit(100);
                if (!error && Array.isArray(data) && data.length > 0) {
                    // Filter Supabase rows by plan capabilities and sport
                    const sportVals = (sportFilterValues || []).map(s => String(s).toLowerCase());
                    const filtered = data.filter(r => {
                        try {
                            // Check if prediction tier is in plan's allowed tiers
                            const rowTier = String(r.tier || 'normal');
                            if (!planCapabilities.tiers.includes(rowTier)) return false;
                            const matches = Array.isArray(r.matches) ? r.matches : [];
                            if (sportVals.length === 0) return true;
                            return matches.some(m => sportVals.includes(String(m.sport || '').toLowerCase()));
                        } catch (e) {
                            return false;
                        }
                    });
                    predictions = filtered;
                } else if (error) {
                    console.warn('[predictions] Supabase fallback error:', error.message || error);
                }
            }
        } catch (fbErr) {
            console.warn('[predictions] Supabase fallback failed:', fbErr.message || fbErr);
        }

        const teamNames = extractTeamNames(predictions).map(n => n.toLowerCase());
        const teamInfoByName = new Map();

        if (teamNames.length > 0) {
            try {
                const teamRes = await query(
                    `
                    SELECT
                        t.id,
                        t.name,
                        NULL::text AS logo,
                        t.location AS country,
                        NULL::int AS league_id,
                        NULL::text AS league_name,
                        NULL::text AS league_country,
                        NULL::text AS league_season,
                        s.sport_key AS sport_id,
                        s.sport_key AS sport_slug,
                        s.title AS sport_name
                    FROM teams t
                    LEFT JOIN sports s ON s.sport_key = t.sport_key
                    WHERE LOWER(t.name) = ANY($1::text[])
                    `,
                    [teamNames]
                );

                const teamIds = [];
                for (const row of teamRes.rows) {
                    teamIds.push(row.id);
                }

                const playersByTeam = new Map();
                if (teamIds.length > 0) {
                    const playersRes = await query(
                        `
                        SELECT id, team_id, full_name AS name, NULL::int AS age, NULL::int AS number, position, NULL::text AS photo
                        FROM players
                        WHERE team_id = ANY($1::int[])
                        ORDER BY team_id, name ASC
                        `,
                        [teamIds]
                    );
                    const grouped = buildPlayersByTeam(playersRes.rows);
                    for (const [teamId, players] of grouped.entries()) {
                        playersByTeam.set(teamId, players);
                    }
                }

                for (const row of teamRes.rows) {
                    teamInfoByName.set(String(row.name).toLowerCase(), {
                        id: row.id,
                        name: row.name,
                        logo: row.logo,
                        country: row.country,
                        league: {
                            id: row.league_id,
                            name: row.league_name,
                            country: row.league_country,
                            season: row.league_season
                        },
                        sport: {
                            id: row.sport_id,
                            slug: row.sport_slug,
                            name: row.sport_name
                        },
                        players: playersByTeam.get(row.id) || []
                    });
                }
            } catch (enrichErr) {
                console.warn('[predictions] enrichment skipped:', enrichErr.message);
            }
        }

        const enrichedPredictions = predictions.map((row) => {
            const matches = Array.isArray(row.matches) ? row.matches : [];
            const enrichedMatches = matches.map((m) => {
                const home = m?.home_team || m?.metadata?.home_team || null;
                const away = m?.away_team || m?.metadata?.away_team || null;
                const homeKey = home ? String(home).toLowerCase() : null;
                const awayKey = away ? String(away).toLowerCase() : null;
                return {
                    ...enrichMatchMetadata(m, row),
                    home_team_info: homeKey ? (teamInfoByName.get(homeKey) || null) : null,
                    away_team_info: awayKey ? (teamInfoByName.get(awayKey) || null) : null
                };
            });
            return {
                ...row,
                matches: enrichedMatches
            };
        }).map(enrichPredictionDetails);

        const planFilteredPredictions = filterPredictionsForPlan(enrichedPredictions, planId)
            .filter((prediction) => predictionMatchesSport(prediction, sportFilterValues));
        const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }).toLowerCase();
        const dailyLimits = calculateDailyAllocations(planId, todayName);

        res.status(200).json({
            plan_id: planId,
            sport: sport || 'all',
            day: todayName,
            daily_limits: dailyLimits,
            count: planFilteredPredictions.length,
            predictions: planFilteredPredictions
        });
    } catch (err) {
        console.error('[predictions] Route Error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Deterministic rebuild endpoint (useful for scheduled jobs)
router.post('/rebuild', requireRole('admin'), async (_req, res) => {
    try {
        console.log('[predictions] Manual rebuild of final outputs requested...');
        const result = await rebuildFinalOutputs();
        res.status(200).json({ ok: true, message: "Final outputs rebuilt successfully", data: result });
    } catch (err) {
        console.error('[predictions] rebuild error:', err);
        res.status(500).json({ error: 'Rebuild failed', details: err.message });
    }
});

// Clear test data from raw and filtered tables
router.post('/clear-test', requireRole('admin'), async (_req, res) => {
    try {
        console.log('[predictions] Clearing test data...');
        // Delete test data from predictions_filtered first (foreign key constraint)
        await query(`DELETE FROM predictions_filtered WHERE raw_id IN (SELECT id FROM predictions_raw WHERE metadata->>'data_mode' = 'test')`);
        // Delete test data from predictions_raw
        const rawResult = await query(`DELETE FROM predictions_raw WHERE metadata->>'data_mode' = 'test'`);
        // Clear predictions_final (will be rebuilt)
        await query(`DELETE FROM predictions_final`);
        res.status(200).json({ 
            ok: true, 
            message: "Test data cleared. Run /rebuild to regenerate final outputs.",
            deleted_raw: rawResult.rowCount 
        });
    } catch (err) {
        console.error('[predictions] clear-test error:', err);
        res.status(500).json({ error: 'Clear failed', details: err.message });
    }
});

module.exports = router;
