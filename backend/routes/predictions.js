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