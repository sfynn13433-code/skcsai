const http = require('http');
const SecureStorage = require('./secure-storage'); //
const secureStorage = new SecureStorage(); //
const fs = require('fs');
const path = require('path'); // ← NEW: for working with file paths

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
    // NEW: Serve a messages page
    // ========================================
    if (req.url === '/messages' && req.method === 'GET') {
        try {
            // Read the submissions file
            let submissions = [];
            if (fs.existsSync('submissions.json')) {
                const data = fs.readFileSync('submissions.json', 'utf8');
                submissions = JSON.parse(data);
            }
            
            // Create HTML page
            const html = `
<!DOCTYPE html>
<html>
<head>
    <title>SKCS AI - Contact Messages</title>
    <style>
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            background-color: #f8f9fa;
            padding: 20px;
            max-width: 1000px;
            margin: 0 auto;
        }
        h1 {
            color: #0d6efd;
            text-align: center;
            margin-bottom: 30px;
        }
        .message-card {
            background: white;
            border-left: 4px solid #0d6efd;
            padding: 20px;
            margin-bottom: 20px;
            border-radius: 5px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.08);
        }
        .message-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 10px;
        }
        .message-name {
            font-weight: bold;
            color: #0d6efd;
        }
        .message-email {
            color: #666;
            font-size: 0.9em;
        }
        .message-time {
            color: #888;
            font-size: 0.8em;
        }
        .message-content {
            margin-top: 15px;
            line-height: 1.5;
            white-space: pre-wrap;
        }
        .back-link {
            display: inline-block;
            margin-top: 30px;
            padding: 10px 20px;
            background: #0d6efd;
            color: white;
            text-decoration: none;
            border-radius: 5px;
        }
        .no-messages {
            text-align: center;
            color: #666;
            font-style: italic;
            padding: 40px;
        }
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

    // Homepage / test page
    if (req.url === '/' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end("Hello! Backend server is alive!\n");
        return;
    }

    // Handle form submissions
    if (req.url === '/submit' && req.method === 'POST') {
        let body = '';

        // Collect the form data
        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', () => {
            console.log('Form data received:');
            console.log(body);

            try {
                // Parse the multipart data
                const lines = body.split('\r\n');
                let parsedData = {
                    name: '',
                    email: '',
                    message: ''
                };
                
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
                
                // Save to form-submissions.txt
                const timestamp = new Date().toLocaleString();
                const textData = `\n=== New Form Submission ===\nTime: ${timestamp}\nName: ${parsedData.name}\nEmail: ${parsedData.email}\nMessage: ${parsedData.message}\n`;
                
                fs.appendFile('form-submissions.txt', textData, (err) => {
                    if (err) {
                        console.error('Error saving to file:', err);
                    } else {
                        console.log('✅ Data saved to form-submissions.txt');
                    }
                });
                
                // Save to submissions.json
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


    // ===========================================
    // NEW: SECURE SUBSCRIPTION ENDPOINT
    // ===========================================
    if (req.url === '/api/subscribe' && req.method === 'POST') {
        const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
        const userAgent = req.headers['user-agent'] || 'Unknown';
        
        // Log access
        secureStorage.logAccess(clientIP, '/api/subscribe', userAgent, 200);
        
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        
        req.on('end', async () => {
            try {
                // Check rate limit
                const rateLimit = await secureStorage.checkRateLimit(clientIP, 5, 15); // 5 attempts per 15 min
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
                        retryAfter: 900 // 15 minutes in seconds
                    }));
                    return;
                }
                
                // Parse and validate JSON
                let data;
                try {
                    data = JSON.parse(body);
                } catch {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid JSON data' }));
                    return;
                }
                
                const { email, name } = data;
                
                // Basic validation
                if (!email || typeof email !== 'string' || email.length > 254) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid email address' }));
                    return;
                }
                
                // Email regex validation
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(email)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid email format' }));
                    return;
                }
                
                // Save subscription
                const result = await secureStorage.saveSubscription(email, name, clientIP);
                
                // Set security headers
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
                    token: result.token // In production, send via email, not in response
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


    // If nothing matched
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end("Not found");
});

const PORT = 3000;

server.listen(PORT, () => {
    console.log(`Server is running and listening on port ${PORT}`);
    console.log(`Test URL: http://localhost:${PORT}`);
    console.log(`View messages: http://localhost:${PORT}/messages`);
    console.log(`Subscribe endpoint: http://localhost:${PORT}/api/subscribe`); //
    console.log('Form data will be saved to:');
    console.log('  - form-submissions.txt (text format)');
    console.log('  - submissions.json (JSON format)');
    console.log('  - subscriptions.encrypted.dat (secure subscriptions)');
});