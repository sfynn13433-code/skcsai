'use strict';

const express = require('express');
const axios = require('axios');
const { query } = require('../db');
const { requireRole } = require('../utils/auth');

const router = express.Router();

const OPENAI_KEY = process.env.OPENAI_KEY;

router.post('/', requireRole('user'), async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) {
            return res.status(400).json({ error: 'Message is required' });
        }

        if (!OPENAI_KEY) {
            console.warn('[chat] No OPENAI_KEY set, using fallback.');
            return res.status(200).json({ 
                response: "I'm currently in maintenance mode. Please try again later when my brain is connected!" 
            });
        }

        // 1. Fetch some context from predictions_final to help the AI
        const dbRes = await query(
            `select matches, total_confidence, risk_level from predictions_final order by created_at desc limit 10`
        );
        
        const context = dbRes.rows.map(r => {
            const m = r.matches[0];
            return `${m.home_team} vs ${m.away_team} (${m.sport}): Prediction ${m.prediction}, Confidence ${r.total_confidence}%`;
        }).join('\n');

        // 2. Call OpenAI
        const completion = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-3.5-turbo',
            messages: [
                { 
                    role: 'system', 
                    content: `You are SKCS AI, a sports prediction expert. Use the following context to answer questions if relevant. Be concise, professional, and clear. 
                    Context of latest predictions:\n${context}` 
                },
                { role: 'user', content: message }
            ],
            max_tokens: 300
        }, {
            headers: {
                'Authorization': `Bearer ${OPENAI_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const aiResponse = completion.data.choices[0].message.content;

        res.status(200).json({
            response: aiResponse
        });

    } catch (err) {
        console.error('[chat] error:', err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to get AI response' });
    }
});

module.exports = router;
