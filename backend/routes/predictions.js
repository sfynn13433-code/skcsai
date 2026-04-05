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

function getSportFilterValues(sport) {
    const key = String(sport || '').trim().toLowerCase();
    if (!key) return [];
    return SPORT_FILTER_MAP[key] || [key];
}

function predictionMatchesSport(prediction, sportFilterValues) {
    if (!Array.isArray(sportFilterValues) || sportFilterValues.length === 0) return true;
    const allowed = new Set(sportFilterValues.map((value) => String(value).toLowerCase()));
    const matches = Array.isArray(prediction?.matches) ? prediction.matches : [];
    if (matches.length === 0) return false;
    return matches.every((match) => allowed.has(String(match?.sport || '').toLowerCase()));
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

function enrichPredictionDetails(prediction) {
    const matches = Array.isArray(prediction?.matches) ? prediction.matches : [];
    const firstMatch = matches[0] || {};
    const firstMeta = firstMatch.metadata || {};
    const existing = prediction?.prediction_details;
    if (existing && existing.outcome && existing.reasoning) return prediction;

    const type = String(prediction?.type || prediction?.section_type || '').toLowerCase();
    const fallbackOutcome =
        (firstMeta.prediction_details && firstMeta.prediction_details.outcome) ||
        (type === 'acca' ? '6-Match ACCA' :
            type === 'same_match' ? 'Same Match Builder' :
                type === 'multi' ? 'Multi Bet' :
                    (firstMeta.predicted_outcome || firstMatch.prediction || 'Prediction'));
    const fallbackReasoning =
        (firstMeta.prediction_details && firstMeta.prediction_details.reasoning) ||
        firstMeta.reasoning ||
        '';

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
            SELECT id, tier, type, matches, total_confidence, risk_level, created_at
            FROM predictions_final
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
                    ...m,
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
