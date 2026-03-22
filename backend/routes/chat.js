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
    // Note: The frontend sends { message: "..." }, not userMessage
    const { message } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    try {
        // 1. Fetch the latest 5 records from predictions_final
        const { data: predictions, error } = await supabase
            .from('predictions_final')
            .select('home_team, away_team, predicted_winner, confidence, match_date')
            .order('match_date', { ascending: false })
            .limit(5);

        if (error) throw error;

        // 2. Format the data into a "Context String"
        const contextString = predictions.map(p => 
            `${p.home_team} vs ${p.away_team} on ${p.match_date}: Predicted Winner is ${p.predicted_winner} (${p.confidence}% confidence).`
        ).join('\n');

        // 3. Send to Ollama Chat API (using explicitly configured 127.0.0.1 and gemma3:4b)
        const ollamaResponse = await axios.post('http://127.0.0.1:11434/api/chat', {
            model: process.env.OLLAMA_MODEL || 'gemma3:4b',
            messages: [
                { 
                    role: 'system', 
                    content: `You are SKCS AI. Use the following AFL prediction data to answer the user's question accurately. If the data isn't here, say you don't have that specific prediction yet.\n\nDATA:\n${contextString}` 
                },
                { 
                    role: 'user', 
                    content: message 
                }
            ],
            stream: false
        });

        // 4. Return the formatted reply 
        // Note: Modified slightly to match frontend's expectation of { response: "..." }
        res.status(200).json({
            response: ollamaResponse.data.message.content
        });

    } catch (error) {
        console.error('[chat] Migration Error:', error.response?.data || error.message);
        res.status(500).json({ error: 'Chatbot is currently offline.' });
    }
});

module.exports = router;
