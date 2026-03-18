'use strict';

const express = require('express');
const { runPipelineForMatches, runPipelineFromConfiguredDataMode, rebuildFinalOutputs } = require('../services/aiPipeline');
const config = require('../config');
const { requireRole } = require('../utils/auth');

const router = express.Router();

// Accept match data and run the full pipeline:
// predictions_raw -> predictions_filtered -> predictions_final
router.post('/run', requireRole('admin'), async (req, res) => {
    try {
        const matches = req.body?.matches;
        const pipeline = Array.isArray(matches) && matches.length > 0
            ? await runPipelineForMatches({ matches })
            : await runPipelineFromConfiguredDataMode();

        if (pipeline?.error) {
            res.status(409).json({ error: pipeline.error });
            return;
        }

        const final = await rebuildFinalOutputs();

        res.status(200).json({
            mode: pipeline.mode,
            raw_count: pipeline.inserted.length,
            filtered_valid: pipeline.filtered_valid,
            filtered_invalid: pipeline.filtered_invalid,
            singles_count: (final?.normal?.singles?.length || 0) + (final?.deep?.singles?.length || 0),
            acca_count: (final?.normal?.accas?.length || 0) + (final?.deep?.accas?.length || 0)
        });
    } catch (err) {
        console.error('Pipeline error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/run', requireRole('admin'), async (_req, res) => {
    try {
        const pipeline = await runPipelineFromConfiguredDataMode();

        if (pipeline?.error) {
            res.status(409).json({ error: pipeline.error });
            return;
        }

        res.status(200).json({
            note: 'GET fallback route used',
            ...pipeline
        });
    } catch (err) {
        console.error('Pipeline error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/mode', requireRole('admin'), async (req, res, next) => {
    try {
        const mode = req.body?.mode;
        if (mode !== 'test' && mode !== 'live') {
            res.status(400).json({ error: 'mode must be test or live' });
            return;
        }

        config.DATA_MODE = mode;
        console.log('[pipeline] DATA_MODE set to %s', mode);

        res.status(200).json({ ok: true, mode });
    } catch (err) {
        console.error('Pipeline error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/rebuild', async (_req, res, next) => {
    try {
        requireRole('admin')(_req, res, () => {});
        if (res.headersSent) return;

        const final = await rebuildFinalOutputs();
        res.status(200).json({ ok: true, final });
    } catch (err) {
        console.error('Pipeline error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
