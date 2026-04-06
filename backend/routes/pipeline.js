'use strict';

const express = require('express');
const { 
    runPipelineForMatches, 
    runPipelineFromConfiguredDataMode, 
    rebuildFinalOutputs 
} = require('../services/aiPipeline');
const { syncAllSports, syncSports } = require('../services/syncService');
const config = require('../config');
const { requireRole } = require('../utils/auth');

const router = express.Router();

/**
 * TRIGGER REAL DATA SYNC
 * URL: POST https://skcsai.onrender.com/api/pipeline/sync
 * This is the main button to pull real matches from APIs into Supabase.
 */
router.post('/sync', requireRole('admin'), async (req, res) => {
    const requestedSport = req.body?.sport ? String(req.body.sport).toLowerCase() : null;
    console.log(`[pipeline] Starting manual sync of REAL sports data${requestedSport ? ` for ${requestedSport}` : ''} (background)...`);
    
    // Return immediately to avoid Render's 30-second timeout
    res.status(202).json({
        ok: true,
        message: "Sync started in background. Check /api/pipeline/status for results.",
        requestedSport
    });

    // Run sync in background
    try {
        const result = requestedSport
            ? await syncSports({ sports: requestedSport })
            : await syncAllSports();
        console.log('[pipeline] Background sync complete:', JSON.stringify({
            sync: result ? 'ok' : 'no result',
            requestedSport,
            publishRun: result?.publishRun || null,
            totalMatchesProcessed: result?.totalMatchesProcessed || 0
        }));
    } catch (err) {
        console.error('[pipeline] Background sync failed:', err.message);
    }
});

// Check sync status / latest data
router.get('/status', requireRole('admin'), async (_req, res) => {
    try {
        const { createClient } = require('@supabase/supabase-js');
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY
        );
        const { count: rawCount } = await supabase.from('predictions_raw').select('*', { count: 'exact', head: true });
        const { count: finalCount } = await supabase.from('predictions_final').select('*', { count: 'exact', head: true });
        res.json({ ok: true, predictions_raw: rawCount, predictions_final: finalCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
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
        res.status(500).json({ error: 'Rebuild failed', details: err.message });
    }
});

module.exports = router;
