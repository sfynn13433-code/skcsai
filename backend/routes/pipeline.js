'use strict';

const express = require('express');
const { 
    runPipelineForMatches, 
    runPipelineFromConfiguredDataMode, 
    rebuildFinalOutputs 
} = require('../services/aiPipeline');
const { syncAllSports } = require('../services/syncService');
const config = require('../config');
const { requireRole } = require('../utils/auth');

const router = express.Router();

/**
 * TRIGGER REAL DATA SYNC
 * URL: POST https://skcsai.onrender.com/api/pipeline/sync
 * This is the main button to pull real matches from APIs into Supabase.
 */
router.post('/sync', requireRole('admin'), async (req, res) => {
    try {
        console.log('[pipeline] Starting manual sync of REAL sports data...');
        
        // This calls the syncService to fetch real games and run AI analysis
        const result = await syncAllSports();
        
        // Rebuild the website outputs immediately after sync
        const final = await rebuildFinalOutputs();

        res.status(200).json({
            ok: true,
            message: "Real-world matches synced and AI analysis complete.",
            sync_details: result,
            final_status: "Web outputs rebuilt"
        });
    } catch (err) {
        console.error('[pipeline] Sync trigger failed:', err);
        res.status(500).json({ error: 'Sync failed', details: err.message });
    }
});

// Accept manual match data and run the full pipeline
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

// Switch between 'test' and 'live' mode
router.post('/mode', requireRole('admin'), async (req, res) => {
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

// Force a rebuild of the website outputs (predictions_final table)
router.post('/rebuild', requireRole('admin'), async (_req, res) => {
    try {
        console.log('[pipeline] Manual rebuild of final outputs requested...');
        const final = await rebuildFinalOutputs();
        res.status(200).json({ ok: true, message: "Final outputs rebuilt successfully", data: final });
    } catch (err) {
        console.error('Pipeline rebuild error:', err);
        res.status(500).json({ error: 'Rebuild failed' });
    }
});

module.exports = router;