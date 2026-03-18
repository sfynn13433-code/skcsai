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
        if (!tier) {
            res.status(400).json({ error: 'tier must be normal or deep' });
            return;
        }

        const dbRes = await query(
            `
            select id, tier, type, matches, total_confidence, risk_level, created_at
            from predictions_final
            where tier = $1
            order by type asc, total_confidence desc, created_at desc;
            `,
            [tier]
        );

        res.status(200).json({
            tier,
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
