// subscriptionHandler.js
const SecurityManager = require('./security');
const SecureDatabase = require('./database');

class SubscriptionHandler {
    constructor() {
        this.security = new SecurityManager();
        this.db = new SecureDatabase();
    }
    
    async handleSubscribe(req, res) {
        const clientIP = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'] || 'Unknown';
        
        // Log access attempt
        await this.db.logAccess(clientIP, '/subscribe', userAgent, 200);
        
        // Check rate limit
        const rateLimit = this.security.checkRateLimit(clientIP);
        if (!rateLimit.allowed) {
            res.writeHead(429, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Too many requests', retryAfter: 900 }));
            return;
        }
        
        // Parse request body
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        
        req.on('end', async () => {
            try {
                const { email, name } = JSON.parse(body);
                
                // Validate inputs
                if (!email || !this.security.validateEmail(email)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid email address' }));
                    return;
                }
                
                if (name && name.length > 100) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Name too long' }));
                    return;
                }
                
                // Check if already subscribed
                const existing = await this.db.getSubscriber(email);
                if (existing) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        message: 'Already subscribed',
                        status: existing.is_verified ? 'verified' : 'pending'
                    }));
                    return;
                }
                
                // Generate verification token
                const token = this.security.generateToken();
                
                // Save to database
                await this.db.addSubscriber(email, name, token, clientIP);
                
                // In production: Send verification email
                console.log(`📧 Verification token for ${email}: ${token}`);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    message: 'Please check your email to confirm subscription',
                    success: true 
                }));
                
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Internal server error' }));
            }
        });
    }
    
    async handleVerify(req, res) {
        // Handle email verification
        // ... verification logic
    }
    
    async handleUnsubscribe(req, res) {
        // Handle unsubscribe with secure token
        // ... unsubscribe logic
    }
}