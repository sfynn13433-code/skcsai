'use strict';

const express = require('express');
const { getPredictionsByTier } = require('../database');
const { requireSupabaseUser, requireActiveSubscription } = require('../middleware/supabaseJwt');
const config = require('../config');

const router = express.Router();

router.get('/predictions', requireSupabaseUser, requireActiveSubscription, async (req, res) => {
    try {
        const date = req.query.date || new Date().toISOString().split('T')[0];
        const tierKey = req.query.tier;

        if (!tierKey || typeof tierKey !== 'string' || !config.tiers?.[tierKey]) {
            res.status(400).json({ error: 'tier is required and must be a valid plan key (e.g. normal30, deep30)' });
            return;
        }

        const predictions = await getPredictionsByTier(tierKey, date);

        res.status(200).json({
            tier: tierKey,
            date,
            count: predictions.length,
            predictions
        });
    } catch (err) {
        console.error('[user] predictions error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
