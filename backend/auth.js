// auth.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const config = require('./config');
const { createUser, findUserByEmail, findUserById } = require('./database');

const saltRounds = 10;

// Helper to parse JSON body from raw HTTP request
function parseJSONBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                resolve(JSON.parse(body));
            } catch (e) {
                reject(e);
            }
        });
        req.on('error', reject);
    });
}

// Registration handler
async function register(req, res) {
    try {
        const body = await parseJSONBody(req);
        const { email, password } = body;
        if (!email || !password) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Email and password required' }));
            return;
        }

        // Check if user already exists
        const existing = await findUserByEmail(email);
        if (existing) {
            res.writeHead(409, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'User already exists' }));
            return;
        }

        // Hash password
        const hash = await bcrypt.hash(password, saltRounds);

        // Create user (default normal tier, 30 days expiry)
        const user = await createUser(email, hash, 'normal', 30);

        // Generate JWT token
        const token = jwt.sign(
            { id: user.id, email: user.email, subscription_type: user.subscription_type },
            config.jwtSecret,
            { expiresIn: '7d' }
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            token,
            user: {
                id: user.id,
                email: user.email,
                subscription_type: user.subscription_type
            }
        }));
    } catch (error) {
        console.error('Registration error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
    }
}

// Login handler
async function login(req, res) {
    try {
        const body = await parseJSONBody(req);
        const { email, password } = body;
        if (!email || !password) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Email and password required' }));
            return;
        }

        const user = await findUserByEmail(email);
        if (!user) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid credentials' }));
            return;
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid credentials' }));
            return;
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, subscription_type: user.subscription_type },
            config.jwtSecret,
            { expiresIn: '7d' }
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            token,
            user: {
                id: user.id,
                email: user.email,
                subscription_type: user.subscription_type
            }
        }));
    } catch (error) {
        console.error('Login error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
    }
}

// Authentication middleware for raw HTTP
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Access token required' }));
        return false; // indicates not authenticated
    }

    try {
        const user = jwt.verify(token, config.jwtSecret);
        req.user = user;
        return true; // authenticated
    } catch (err) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid or expired token' }));
        return false;
    }
}

module.exports = {
    register,
    login,
    authenticateToken
};