const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url'); // for parsing query parameters
const cron = require('node-cron'); // for scheduling
const SecureStorage = require('./secure-storage');
const secureStorage = new SecureStorage();

// ========== NEW: Prediction pipeline modules ==========
require('dotenv').config(); // ensure .env is loaded
const config = require('./config');
const PredictionPipeline = require('./predictionPipeline');
const { APISportsClient, OddsAPIClient } = require('./apiClients');

// Database helper functions – assume they are exported from database.js
const { 
    getMatch, 
    getTeamStats, 
    getInjuries, 
    getNewsSentiment,
    getAllUpcomingMatches,
    savePrediction,
    getPredictionsByTier 
} = require('./database'); // adjust path if needed

// ========== NEW: Scheduled job to generate predictions daily ==========
cron.schedule('0 2 * * *', async () => { // runs at 2:00 AM every day
    console.log('Running daily prediction generation...');
    try {
        const matches = await getAllUpcomingMatches(7); // next 7 days
        for (const match of matches) {
            const pipeline = new PredictionPipeline(
                match.id,
                getMatch,
                getTeamStats,
                getInjuries,
                getNewsSentiment
            );
            const prediction = await pipeline.run();
            if (prediction) {
                await savePrediction(prediction);
                console.log(`Generated prediction for match ${match.id}`);
            }
        }
        console.log('Daily prediction generation complete.');
    } catch (error) {
        console.error('Error in daily prediction job:', error);
    }
});

// ========== Create HTTP server ==========
const server = http.createServer((req, res) => {
    // Set CORS headers for ALL requests
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Log every request
    console.log(`→ New request: ${req.method} ${req.url}`);

    // ========================================
    // Parse URL for query parameters (used in API routes)
    // ========================================
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // ========================================
    // Existing routes
    // ========================================

    // Messages page
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
        body { font-family: 'Segoe UI', Arial, sans-serif; background-color: #f8f9fa; padding: 20px; max-width: 1000px; margin: 0 auto; }
        h1 { color: #0d6efd; text-align: center; margin-bottom: 30px; }
        .message-card { background: white; border-left: 4px solid #0d6efd; padding: 20px; margin-bottom: 20px; border-radius: 5px; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
        .message-header { display: flex; justify-content: space-between; margin-bottom: 10px; }
        .message-name { font-weight: bold; color: #0d6efd; }
        .message-email { color: #666; font-size: 0.9em; }
        .message-time { color: #888; font-size: 0.8em; }
        .message-content { margin-top: 15px; line-height: 1.5; white-space: pre-wrap; }
        .back-link { display: inline-block; margin-top: 30px; padding: 10px 20px; background: #0d6efd; color: white; text-decoration: none; border-radius: 5px; }
        .no-messages { text-align: center; color: #666; font-style: italic; padding: 40px; }
    </style>
</head>
<body>
    <h1>📨 Contact Messages Received</h1>
    ${submissions.length === 0 ? 
        '<div class="no-messages">No messages received yet.</div>' : 
        submissions.reverse().map(msg => `
        <div class="message-card">
            <div class="message-header">
                <div>
                    <div class="message-name">${msg.name}</div>
                    <div class="message-email">${msg.email}</div>
                </div>
                <div class="message-time">${new Date(msg.timestamp).toLocaleString()}</div>
            </div>
            <div class="message-content">${msg.message}</div>
        </div>
        `).join('')
    }
    <a href="javascript:history.back()" class="back-link">← Back to Website</a>
</body>
</html>`;
            
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
            return;
        } catch (error) {
            console.log('Error loading messages:', error);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Error loading messages');
            return;
        }
    }

    // Homepage
    if (pathname === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end("Hello! Backend server is alive!\n");
        return;
    }

    // Form submission (contact)
    if (pathname === '/submit' && req.method === 'POST') {
        let body = '';

        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => {
            console.log('Form data received:');
            console.log(body);

            try {
                const lines = body.split('\r\n');
                let parsedData = { name: '', email: '', message: '' };
                
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes('name="name"')) {
                        parsedData.name = lines[i + 2] || '';
                    }
                    if (lines[i].includes('name="email"')) {
                        parsedData.email = lines[i + 2] || '';
                    }
                    if (lines[i].includes('name="message"')) {
                        parsedData.message = lines[i + 2] || '';
                    }
                }
                
                console.log('Parsed data:', parsedData);
                
                const timestamp = new Date().toLocaleString();
                const textData = `\n=== New Form Submission ===\nTime: ${timestamp}\nName: ${parsedData.name}\nEmail: ${parsedData.email}\nMessage: ${parsedData.message}\n`;
                
                fs.appendFile('form-submissions.txt', textData, (err) => {
                    if (err) console.error('Error saving to file:', err);
                    else console.log('✅ Data saved to form-submissions.txt');
                });
                
                const jsonData = {
                    timestamp: new Date().toISOString(),
                    name: parsedData.name || 'N/A',
                    email: parsedData.email || 'N/A',
                    message: parsedData.message || 'N/A'
                };
                
                let allSubmissions = [];
                if (fs.existsSync('submissions.json')) {
                    const existing = fs.readFileSync('submissions.json', 'utf8');
                    allSubmissions = JSON.parse(existing);
                }
                allSubmissions.push(jsonData);
                fs.writeFileSync('submissions.json', JSON.stringify(allSubmissions, null, 2));
                console.log('✅ Data saved to submissions.json');
                
            } catch (error) {
                console.log('Error parsing/saving data:', error);
            }

            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end("Thank you! We received your message.");
        });

        return;
    }

    // Secure subscription endpoint
    if (pathname === '/api/subscribe' && req.method === 'POST') {
        const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
        const userAgent = req.headers['user-agent'] || 'Unknown';
        
        secureStorage.logAccess(clientIP, '/api/subscribe', userAgent, 200);
        
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        
        req.on('end', async () => {
            try {
                const rateLimit = await secureStorage.checkRateLimit(clientIP, 5, 15);
                if (!rateLimit.allowed) {
                    res.writeHead(429, { 
                        'Content-Type': 'application/json',
                        'X-RateLimit-Limit': '5',
                        'X-RateLimit-Remaining': '0',
                        'X-RateLimit-Reset': rateLimit.resetTime
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
                    res.end(JSON.stringify({ error: 'Invalid JSON data' }));
                    return;
                }
                
                const { email, name } = data;
                
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
                
                const result = await secureStorage.saveSubscription(email, name, clientIP);
                
                res.writeHead(200, {
                    'Content-Type': 'application/json',
                    'Content-Security-Policy': "default-src 'self'",
                    'X-Content-Type-Options': 'nosniff',
                    'X-Frame-Options': 'DENY',
                    'X-RateLimit-Limit': '5',
                    'X-RateLimit-Remaining': rateLimit.remaining.toString(),
                    'X-RateLimit-Reset': rateLimit.resetTime
                });
                
                res.end(JSON.stringify({
                    success: true,
                    message: 'Subscription received. Please check your email for verification.',
                    requiresVerification: true,
                    token: result.token
                }));
                
                console.log(`✅ Secure subscription: ${email} from ${clientIP}`);
                
            } catch (error) {
                console.error('Subscription error:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal server error' }));
            }
        });
        
        return;
    }

    // ========================================
    // NEW: Prediction API routes
    // ========================================

    // Get upcoming matches (optional sport filter)
    if (pathname === '/api/matches' && req.method === 'GET') {
        (async () => {
            try {
                const sport = parsedUrl.query.sport;
                const days = parseInt(parsedUrl.query.days) || 7;
                const matches = await getAllUpcomingMatches(days, sport);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(matches));
            } catch (error) {
                console.error('Error fetching matches:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal server error' }));
            }
        })();
        return;
    }

    // Get predictions filtered by tier
    if (pathname === '/api/predictions' && req.method === 'GET') {
        (async () => {
            try {
                const tier = parsedUrl.query.tier || 'deep30';
                const date = parsedUrl.query.date || new Date().toISOString().split('T')[0];
                const predictions = await getPredictionsByTier(tier, date);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    tier,
                    date,
                    count: predictions.length,
                    predictions
                }));
            } catch (error) {
                console.error('Error fetching predictions:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal server error' }));
            }
        })();
        return;
    }

    // Generate prediction for a specific match (test endpoint)
    if (pathname.startsWith('/api/generate-prediction/') && req.method === 'GET') {
        (async () => {
            try {
                const matchId = pathname.split('/').pop();
                const pipeline = new PredictionPipeline(
                    matchId,
                    getMatch,
                    getTeamStats,
                    getInjuries,
                    getNewsSentiment
                );
                const prediction = await pipeline.run();
                if (prediction) {
                    // Optionally save it
                    await savePrediction(prediction);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, prediction }));
                } else {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Match not found or prediction failed' }));
                }
            } catch (error) {
                console.error('Error generating prediction:', error);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal server error' }));
            }
        })();
        return;
    }

    // If no route matched
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end("Not found");
});

const PORT = 3000;

server.listen(PORT, () => {
    console.log(`Server is running and listening on port ${PORT}`);
    console.log(`Test URL: http://localhost:${PORT}`);
    console.log(`View messages: http://localhost:${PORT}/messages`);
    console.log(`Subscribe endpoint: http://localhost:${PORT}/api/subscribe`);
    console.log(`Matches API: http://localhost:${PORT}/api/matches`);
    console.log(`Predictions API: http://localhost:${PORT}/api/predictions?tier=deep30`);
    console.log('Form data will be saved to:');
    console.log('  - form-submissions.txt (text format)');
    console.log('  - submissions.json (JSON format)');
    console.log('  - subscriptions.encrypted.dat (secure subscriptions)');
    console.log('Daily prediction generation scheduled at 2:00 AM.');
});