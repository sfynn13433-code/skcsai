'use strict';

const express = require('express');
const { query } = require('../db');
const { rebuildFinalOutputs } = require('../services/aiPipeline');
const { requireRole } = require('../utils/auth');

const router = express.Router();

function normalizeTier(tier) {
    if (tier === 'normal' || tier === 'deep') return tier;
    return null;
}

router.get('/', requireRole('user'), async (req, res) => {
    try {
        const tier = normalizeTier(req.query.tier);
        const sport = req.query.sport; // Optional sport filter

        if (!tier) {
            res.status(400).json({ error: 'tier must be normal or deep' });
            return;
        }

        let queryStr = `
            select id, tier, type, matches, total_confidence, risk_level, created_at
            from predictions_final
            where tier = $1
        `;
        const queryParams = [tier];

        if (sport) {
            // Check if any match in the 'matches' JSONB array has the requested sport
            queryStr += ` and exists (
                select 1 from jsonb_array_elements(matches) as m 
                where lower(m->>'sport') = lower($2)
            )`;
            queryParams.push(sport);
        }

        queryStr += ` order by type asc, total_confidence desc, created_at desc;`;

        const dbRes = await query(queryStr, queryParams);

        res.status(200).json({
            tier,
            sport: sport || 'all',
            count: dbRes.rows.length,
            predictions: dbRes.rows
        });
    } catch (err) {
        console.error('[predictions] error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Deterministic rebuild endpoint (useful for scheduled jobs)
router.post('/rebuild', requireRole('admin'), async (_req, res) => {
    try {
        const result = await rebuildFinalOutputs();
        res.status(200).json({ ok: true, result });
    } catch (err) {
        console.error('[predictions] error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
