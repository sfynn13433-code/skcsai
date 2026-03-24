'use strict';

const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
const { requireRole } = require('../utils/auth');

const router = express.Router();

// Initialize Supabase using the backend environment variables
const SUPABASE_URL = process.env.SUPABASE_URL;
// the .env contained SUPABASE_ANON_KEY, so we use that or fallback if needed
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY; 

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

router.post('/', requireRole('user'), async (req, res) => {
    const { message } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    try {
        // 1. Fetch latest predictions (correct columns: matches is JSONB)
        const { data: predictions, error } = await supabase
            .from('predictions_final')
            .select('id, tier, type, matches, total_confidence, risk_level, created_at')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        // 2. Flatten matches from JSONB into searchable list
        const allMatches = [];
        for (const row of (predictions || [])) {
            if (row.matches && Array.isArray(row.matches)) {
                for (const m of row.matches) {
                    allMatches.push({
                        home: m.metadata?.home_team || m.home_team || 'Unknown',
                        away: m.metadata?.away_team || m.away_team || 'Unknown',
                        prediction: m.prediction || 'N/A',
                        market: m.market || 'N/A',
                        confidence: row.total_confidence || 0,
                        risk: row.risk_level || 'N/A',
                        sport: m.sport || 'football',
                        type: row.type || 'single'
                    });
                }
            }
        }

        // 3. Search for matches related to the user's question
        const query = message.toLowerCase();
        const relevant = allMatches.filter(m =>
            query.includes(m.home.toLowerCase()) ||
            query.includes(m.away.toLowerCase()) ||
            query.includes(m.sport.toLowerCase())
        );

        // 4. Build response
        let response;
        if (relevant.length > 0) {
            const lines = relevant.slice(0, 5).map(m =>
                `${m.home} vs ${m.away} (${m.sport})\n  Prediction: ${m.prediction.replace(/_/g, ' ').toUpperCase()}\n  Market: ${m.market}\n  Confidence: ${m.confidence}%\n  Risk: ${m.risk}`
            );
            response = `SKCS AI found ${relevant.length} matching prediction(s):\n\n${lines.join('\n\n')}`;
        } else if (allMatches.length > 0) {
            const sample = allMatches.slice(0, 5).map(m =>
                `${m.home} vs ${m.away} (${m.sport}) - ${m.prediction.replace(/_/g, ' ').toUpperCase()} [${m.confidence}%]`
            );
            response = `No exact match found for "${message}". Here are the latest predictions:\n\n${sample.join('\n')}`;
        } else {
            response = 'No predictions are currently available. The system may be syncing new data.';
        }

        res.status(200).json({ response });

    } catch (error) {
        console.error('[chat] Error:', error.message);
        res.status(500).json({ error: 'Chatbot encountered an error. Please try again.' });
    }
});

module.exports = router;
