'use strict';

const express = require('express');
const { query } = require('../db');
const { rebuildFinalOutputs } = require('../services/aiPipeline');
const { requireRole } = require('../utils/auth');

const router = express.Router();

// GET /api/predictions
// Simplified: always returns data, default tier = 'normal'
router.get('/', requireRole('user'), async (req, res) => {
    try {
        // Use 'normal' as default if tier is missing
        const tier = req.query.tier || 'normal';
        const sport = req.query.sport;

        console.log(`[PREDICTIONS] Request for Tier: ${tier}, Sport: ${sport || 'all'}`);

        let queryStr = `
            SELECT id, tier, type, matches, total_confidence, risk_level, created_at
            FROM predictions_final
            WHERE tier = $1
        `;
        const queryParams = [tier];

        if (sport) {
            queryStr += ` AND EXISTS (
                SELECT 1 FROM jsonb_array_elements(matches) AS m 
                WHERE LOWER(m->>'sport') = LOWER($2)
            )`;
            queryParams.push(sport);
        }

        queryStr += ` ORDER BY created_at DESC LIMIT 20;`;

        const dbRes = await query(queryStr, queryParams);

        res.status(200).json({
            tier,
            sport: sport || 'all',
            count: dbRes.rows.length,
            predictions: dbRes.rows
        });
    } catch (err) {
        console.error('[predictions] Route Error:', err);
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