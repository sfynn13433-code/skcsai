'use strict';

const express = require('express');
const { getPredictionsByTier } = require('../database');
const { requireSupabaseUser, requireActiveSubscription } = require('../middleware/supabaseJwt');
const config = require('../config');

const router = express.Router();

router.get('/predictions', requireSupabaseUser, requireActiveSubscription, async (req, res) => {
    try {
        if (!req.user) {
            res.status(401).json({ error: 'Access token required' });
            return;
        }

        const date = req.query.date || new Date().toISOString().split('T')[0];

        const rawTier = typeof req.query.tier === 'string' ? req.query.tier : '';
        const normalizedTier = rawTier.toLowerCase().includes('deep') ? 'deep' : 'normal';
        const tierKey = normalizedTier === 'deep' ? 'deep30' : 'normal30';

        if (!config.tiers?.[tierKey]) {
            res.status(200).json({
                tier: tierKey,
                date,
                count: 0,
                predictions: []
            });
            return;
        }

        const dbPredictions = await getPredictionsByTier(tierKey, date);
        const predictions = Array.isArray(dbPredictions) ? dbPredictions : [];

        res.status(200).json({
            tier: tierKey,
            date,
            count: predictions.length,
            predictions
        });
    } catch (error) {
        console.error('PREDICTIONS ERROR:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
