'use strict';

const express = require('express');
const { query } = require('../db');

const router = express.Router();

router.get('/routes', (req, res) => {
    // Note: Express does not provide a stable public API for route listing.
    // We use the internal stack for admin debugging only.
    const app = req.app;
    const routes = [];

    const stack = app?._router?.stack || [];
    for (const layer of stack) {
        if (layer.route && layer.route.path) {
            const methods = Object.keys(layer.route.methods || {}).filter(m => layer.route.methods[m]);
            routes.push({ path: layer.route.path, methods });
        } else if (layer.name === 'router' && layer.handle?.stack) {
            for (const sub of layer.handle.stack) {
                if (sub.route && sub.route.path) {
                    const methods = Object.keys(sub.route.methods || {}).filter(m => sub.route.methods[m]);
                    routes.push({ path: sub.route.path, methods });
                }
            }
        }
    }

    res.status(200).json({ count: routes.length, routes });
});

router.get('/db', async (_req, res) => {
    try {
        const result = await query('select now() as now;');
        res.status(200).json({ ok: true, now: result.rows[0]?.now || null });
    } catch (err) {
        console.error('[debug/db] error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
