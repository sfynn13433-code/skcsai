'use strict';

// ---------------------------------------------------------------
//  SKCS‑AI backend – plain Node HTTP server
// ---------------------------------------------------------------

require('dotenv').config();               // load .env locally (Render provides its own vars)

const http   = require('http');
const fs     = require('fs');
const url    = require('url');            // for query‑string parsing
const cron   = require('node-cron');    // scheduled jobs

// ----- Local helpers / services ---------------------------------
const SecureStorage = require('./secure-storage');
const secureStorage = new SecureStorage();

const config = require('./config');
const { register, login, authenticateToken } = require('./auth');

const PredictionPipeline = require('./predictionPipeline');
const { APISportsClient, OddsAPIClient } = require('./apiClients');

// ----- DB helper functions (adjust path if needed) -------------
const {
    getMatch,
    getTeamStats,
    getInjuries,
    getNewsSentiment,
    getAllUpcomingMatches,
    savePrediction,
    getPredictionsByTier,
    insertFinalPredictionRow,
    getLatestPredictions
} = require('./database');

// ----- CORS configuration ----------------------------------------
const allowedOrigins = [
    'https://skcsaisports.vercel.app',
    'https://skcsaisports-8pnce0hd6-stephens-projects-e3dd898a.vercel.app',
    'https://www.skcsaisportspredictions.co.za',
    'http://localhost:3000'
];

/**
 * Return true if the request origin is allowed.
 * In addition to the exact whitelist we also accept **any** sub‑domain of
 * `vercel.app` (covers preview URLs that contain a random hash).
 */
function setCorsHeaders(req, res) {
    const origin = req.headers.origin;

    if (
        !origin ||                                   // no Origin header (curl, mobile SDK, etc.)
        allowedOrigins.includes(origin) ||           // exact match to whitelist
        origin.includes('vercel.app')                // any Vercel preview domain
    ) {
        // Echo the origin back (or `*` when we have none)
        if (origin) {
            res.setHeader('Access-Control-Allow-Origin', origin);
        } else {
            res.setHeader('Access-Control-Allow-Origin', '*');
        }

        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers',
                      'Content-Type, Authorization, x-api-key');
        res.setHeader('Access-Control-Allow-Credentials', 'true');

        return true;      // allowed
    }

    return false;         // blocked
}

// ---------------------------------------------------------------
//  Scheduled job – daily prediction generation (02:00 UTC)
// ---------------------------------------------------------------
cron.schedule('0 2 * * *', async () => {
    console.log('Running daily prediction generation...');
    try {
        const matches = await getAllUpcomingMatches(7); // next 7 days
        for (const match of matches) {
            const pipeline = new PredictionPipeline(
                match.id,
                getMatch,
                getTeamStats,
                getInjuries,
                getNewsSentiment,
                insertFinalPredictionRow
            );
            const prediction = await pipeline.run();
            if (prediction) {
                await savePrediction(prediction);
                console.log(`✅ Generated prediction for match ${match.id}`);
            }
        }
        console.log('✅ Daily prediction generation complete.');
    } catch (err) {
        console.error('❌ Error in daily prediction job:', err);
    }
});

// ---------------------------------------------------------------
//  HTTP server – all request handling lives here
// ---------------------------------------------------------------
const server = http.createServer((req, res) => {
    // ---- CORS -------------------------------------------------
    if (!setCorsHeaders(req, res)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'CORS origin denied' }));
        return;
    }

    // ---- Pre‑flight (OPTIONS) ---------------------------------
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // ---- Basic request logging --------------------------------
    console.log(`→ ${req.method} ${req.url}`);

    // ---- Parse URL & query string ----------------------------
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // -----------------------------------------------------------
    //  PUBLIC AUTH ROUTES
    // -----------------------------------------------------------
    if (pathname === '/api/register' && req.method === 'POST') {
        register(req, res);
        return;
    }

    if (pathname === '/api/login' && req.method === 'POST') {
        login(req, res);
        return;
    }

    // -----------------------------------------------------------
    //  PROTECTED PREDICTION ROUTE (requires JWT)
    // -----------------------------------------------------------
    if (pathname === '/api/user/predictions' && req.method === 'GET') {
        (async () => {
            const ok = await authenticateToken(req, res);
            if (!ok) return;    // auth already sent response

            try {
                const user = req.user;

                // Subscription check
                if (user.subscription_status !== 'active' && !user.is_test_user) {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Subscription required' }));
                    return;
                }

                const date = parsedUrl.query.date ||
                             new Date().toISOString().split('T')[0];

                // Map subscription type → tier key
                const tierKey = user.subscription_type === 'deep' ? 'deep30' : 'normal30';
                const predictions = await getPredictionsByTier(tierKey, date);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    tier: user.subscription_type,
                    date,
                    count: predictions.length,
                    predictions
                }));
            } catch (err) {
                console.error('❌ Error fetching predictions:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal server error' }));
            }
        })();
        return;
    }

    // -----------------------------------------------------------
    //  MESSAGES PAGE (static HTML)
    // -----------------------------------------------------------
    if (pathname === '/messages' && req.method === 'GET') {
        try {
            let submissions = [];
            if (fs.existsSync('submissions.json')) {
                const data = fs.readFileSync('submissions.json', 'utf8');
                submissions = JSON.parse(data);
            }

            const html = `<!DOCTYPE html>
<html>
<head>
    <title>SKCS AI - Contact Messages</title>
    <style>
        body {font-family:'Segoe UI',Arial,sans-serif;background:#f8f9fa;padding:20px;max-width:1000px;margin:auto;}
        h1 {color:#0d6efd;text-align:center;margin-bottom:30px;}
        .msg{background:#fff;border-left:4px solid #0d6efd;padding:20px;margin-bottom:20px;border-radius:5px;box-shadow:0 2px 10px rgba(0,0,0,.08);}
        .hdr{display:flex;justify-content:space-between;margin-bottom:10px;}
        .name{font-weight:bold;color:#0d6efd;}
        .email{color:#666;font-size:.9em;}
        .time{color:#888;font-size:.8em;}
        .content{margin-top:15px;line-height:1.5;white-space:pre-wrap;}
        .back{display:inline-block;margin-top:30px;padding:10px 20px;background:#0d6efd;color:#fff;text-decoration:none;border-radius:5px;}
        .none{color:#666;font-style:italic;text-align:center;padding:40px;}
    </style>
</head>
<body>
    <h1>📨 Contact Messages Received</h1>
    ${submissions.length===0
        ? '<div class="none">No messages received yet.</div>'
        : submissions.reverse().map(m=>`
            <div class="msg">
                <div class="hdr">
                    <div>
                        <div class="name">${m.name}</div>
                        <div class="email">${m.email}</div>
                    </div>
                    <div class="time">${new Date(m.timestamp).toLocaleString()}</div>
                </div>
                <div class="content">${m.message}</div>
            </div>`).join('')
    }
    <a href="javascript:history.back()" class="back">← Back to Website</a>
</body>
</html>`;

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
        } catch (err) {
            console.error('❌ Error loading messages:', err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Error loading messages');
        }
        return;
    }

    // -----------------------------------------------------------
    //  ROOT – simple health‑check
    // -----------------------------------------------------------
    if (pathname === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Hello! Backend server is alive!\n');
        return;
    }

    // -----------------------------------------------------------
    //  CONTACT FORM SUBMISSION
    // -----------------------------------------------------------
    if (pathname === '/submit' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                const lines = body.split('\r\n');
                const parsed = { name: '', email: '', message: '' };
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes('name="name"'))    parsed.name    = lines[i + 2] || '';
                    if (lines[i].includes('name="email"'))   parsed.email   = lines[i + 2] || '';
                    if (lines[i].includes('name="message"')) parsed.message = lines[i + 2] || '';
                }

                console.log('📨 Form data parsed:', parsed);

                // ---- Plain‑text log ----
                const txtLog = `\n=== New Form Submission ===\nTime: ${new Date().toLocaleString()}\nName: ${parsed.name}\nEmail: ${parsed.email}\nMessage: ${parsed.message}\n`;
                fs.appendFile('form-submissions.txt', txtLog, err => {
                    if (err) console.error('❌ txt log error:', err);
                    else console.log('✅ Saved to form-submissions.txt');
                });

                // ---- JSON log (array) ----
                const jsonEntry = {
                    timestamp: new Date().toISOString(),
                    name: parsed.name || 'N/A',
                    email: parsed.email || 'N/A',
                    message: parsed.message || 'N/A'
                };
                let all = [];
                if (fs.existsSync('submissions.json')) {
                    const existing = fs.readFileSync('submissions.json', 'utf8');
                    all = JSON.parse(existing);
                }
                all.push(jsonEntry);
                fs.writeFileSync('submissions.json', JSON.stringify(all, null, 2));
                console.log('✅ Saved to submissions.json');
            } catch (err) {
                console.error('❌ Form parsing / saving error:', err);
            }

            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Thank you! We received your message.');
        });
        return;
    }

    // -----------------------------------------------------------
    //  SECURE SUBSCRIPTION ENDPOINT
    // -----------------------------------------------------------
    if (pathname === '/api/subscribe' && req.method === 'POST') {
        const clientIP = req.headers['x-forwarded-for'] ||
                         req.connection?.remoteAddress || 'unknown';
        const userAgent = req.headers['user-agent'] || 'Unknown';

        secureStorage.logAccess(clientIP, '/api/subscribe', userAgent, 200);

        let body = '';
        req.on('data', chunk => body += chunk.toString());

        req.on('end', async () => {
            try {
                // Rate‑limit: 5 calls per 15 min per IP
                const rl = await secureStorage.checkRateLimit(clientIP, 5, 15);
                if (!rl.allowed) {
                    res.writeHead(429, {
                        'Content-Type': 'application/json',
                        'X-RateLimit-Limit': '5',
                        'X-RateLimit-Remaining': '0',
                        'X-RateLimit-Reset': rl.resetTime
                    });
                    res.end(JSON.stringify({
                        error: 'Rate limit exceeded',
                        message: 'Too many subscription attempts. Please try again later.',
                        retryAfter: 900
                    }));
                    return;
                }

                let data;
                try {
                    data = JSON.parse(body);
                } catch {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
                    return;
                }

                const { email, name } = data;

                // ----- Basic validation -----
                if (!email || typeof email !== 'string' || email.length > 254) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid email address' }));
                    return;
                }
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(email)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid email format' }));
                    return;
                }

                // ----- Persist subscription (encrypted) -----
                const result = await secureStorage.saveSubscription(email, name, clientIP);

                // ----- Respond -----
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Content-Security-Policy': "default-src 'self'",
                    'X-Content-Type-Options': 'nosniff',
                    'X-Frame-Options': 'DENY',
                    'X-RateLimit-Limit': '5',
                    'X-RateLimit-Remaining': rl.remaining.toString(),
                    'X-RateLimit-Reset': rl.resetTime
                });
                res.end(JSON.stringify({
                    success: true,
                    message: 'Subscription received – check your email for verification.',
                    requiresVerification: true,
                    token: result.token
                }));

                console.log(`✅ New subscription: ${email} (IP ${clientIP})`);
            } catch (err) {
                console.error('❌ Subscription handler error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal server error' }));
            }
        });
        return;
    }

    // -----------------------------------------------------------
    //  MATCHES API (public, optional sport filter)
    // -----------------------------------------------------------
    if (pathname === '/api/matches' && req.method === 'GET') {
        (async () => {
            try {
                const sport = parsedUrl.query.sport;
                const days  = parseInt(parsedUrl.query.days, 10) || 7;
                const matches = await getAllUpcomingMatches(days, sport);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(matches));
            } catch (err) {
                console.error('❌ /api/matches error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal server error' }));
            }
        })();
        return;
    }

    // -----------------------------------------------------------
    //  PUBLIC PREDICTIONS endpoint (testing)
    // -----------------------------------------------------------
    if (pathname === '/api/predictions' && req.method === 'GET') {
        (async () => {
            try {
                const predictions = await getLatestPredictions(50);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    count: predictions.length,
                    predictions
                }));
            } catch (err) {
                console.error('❌ /api/predictions error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal server error' }));
            }
        })();
        return;
    }

    // -----------------------------------------------------------
    //  SINGLE MATCH PREDICTION (test endpoint)
    // -----------------------------------------------------------
    if (pathname.startsWith('/api/generate-prediction/') && req.method === 'GET') {
        (async () => {
            try {
                const matchId = pathname.split('/').pop();
                const pipeline = new PredictionPipeline(
                    matchId,
                    getMatch,
                    getTeamStats,
                    getInjuries,
                    getNewsSentiment,
                    insertFinalPredictionRow
                );
                const prediction = await pipeline.run();

                if (prediction) {
                    await savePrediction(prediction);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, prediction }));
                } else {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: false,
                        error: 'Match not found or prediction failed'
                    }));
                }
            } catch (err) {
                console.error('❌ /api/generate-prediction error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal server error' }));
            }
        })();
        return;
    }

    // -----------------------------------------------------------
    //  MANUAL RUN‑ALL‑PREDICTIONS (admin / test)
    // -----------------------------------------------------------
    if (pathname === '/api/run-predictions' && req.method === 'GET') {
        (async () => {
            console.log('⚡ Manual prediction run started...');
            try {
                const matches = await getAllUpcomingMatches(30);
                let generated = 0;

                for (const match of matches) {
                    const pipeline = new PredictionPipeline(
                        match.id,
                        getMatch,
                        getTeamStats,
                        getInjuries,
                        getNewsSentiment,
                        insertFinalPredictionRow
                    );
                    const prediction = await pipeline.run();
                    if (prediction) {
                        await savePrediction(prediction);
                        generated++;
                        console.log(`✅ ${match.id}: ${match.home_team} vs ${match.away_team}`);
                    } else {
                        console.log(`❌ No prediction for ${match.id}`);
                    }
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    generated,
                    total: matches.length
                }));
            } catch (err) {
                console.error('❌ Manual run error:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        })();
        return;
    }

    // -----------------------------------------------------------
    //  FALL‑BACK – unknown route
    // -----------------------------------------------------------
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
});

// ---------------------------------------------------------------
//  Start listening (Render injects PORT via env)
// ---------------------------------------------------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`✅ Server listening on http://0.0.0.0:${PORT}`);
    console.log('💡 Test URLs:');
    console.log(`   • Root                → http://localhost:${PORT}/`);
    console.log(`   • Messages page      → http://localhost:${PORT}/messages`);
    console.log(`   • Subscribe API      → http://localhost:${PORT}/api/subscribe`);
    console.log(`   • Matches API        → http://localhost:${PORT}/api/matches`);
    console.log(`   • Public preds API   → http://localhost:${PORT}/api/predictions`);
    console.log(`   • Protected preds    → http://localhost:${PORT}/api/user/predictions (needs JWT)`);
    console.log(`   • Auth routes        → /api/register , /api/login`);
    console.log(`   • Manual run         → http://localhost:${PORT}/api/run-predictions`);
    console.log('🕒 Daily prediction job scheduled for 02:00 UTC (cron “0 2 * * *”).');
});
