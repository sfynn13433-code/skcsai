// auth.js
const { createClient } = require('@supabase/supabase-js');
const config = require('./config');
const { getProfileById, upsertProfile } = require('./database');

const hasSupabaseConfig =
    typeof config?.supabase?.url === 'string' && config.supabase.url.trim().length > 0 &&
    typeof config?.supabase?.anonKey === 'string' && config.supabase.anonKey.trim().length > 0;

const supabase = hasSupabaseConfig
    ? createClient(config.supabase.url, config.supabase.anonKey)
    : null;

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
        if (!supabase) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Supabase Auth is not configured (missing SUPABASE_URL / SUPABASE_ANON_KEY)' }));
            return;
        }

        const body = await parseJSONBody(req);
        const { email, password } = body;
        if (!email || !password) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Email and password required' }));
            return;
        }

        const { data, error } = await supabase.auth.signUp({
            email,
            password
        });

        if (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
            return;
        }

        const userId = data?.user?.id || null;
        if (userId) {
            await upsertProfile({
                id: userId,
                email,
                subscription_type: 'normal',
                subscription_status: 'inactive'
            });
        }

        // In email-confirm flows, Supabase commonly returns no session until user confirms.
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            message: 'Signup successful. Please check your email to verify your account before logging in.',
            user: {
                id: userId,
                email
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
        if (!supabase) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Supabase Auth is not configured (missing SUPABASE_URL / SUPABASE_ANON_KEY)' }));
            return;
        }

        const body = await parseJSONBody(req);
        const { email, password } = body;
        if (!email || !password) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Email and password required' }));
            return;
        }

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
            return;
        }

        const token = data?.session?.access_token;
        const userId = data?.user?.id;

        if (!token || !userId) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Login failed (missing session). Ensure email is verified.' }));
            return;
        }

        const profile = await getProfileById(userId);
        if (!profile) {
            await upsertProfile({
                id: userId,
                email,
                subscription_type: 'normal',
                subscription_status: 'inactive'
            });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            token,
            user: {
                id: userId,
                email,
                subscription_type: profile?.subscription_type || 'normal',
                subscription_status: profile?.subscription_status || 'inactive'
            }
        }));
    } catch (error) {
        console.error('Login error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
    }
}

// Authentication middleware for raw HTTP
async function authenticateToken(req, res) {
    if (!supabase) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Supabase Auth is not configured (missing SUPABASE_URL / SUPABASE_ANON_KEY)' }));
        return false;
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Access token required' }));
        return false; // indicates not authenticated
    }

    try {
        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data?.user) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid or expired token' }));
            return false;
        }

        const supaUser = data.user;
        const profile = await getProfileById(supaUser.id);
        req.user = {
            id: supaUser.id,
            email: supaUser.email,
            subscription_type: profile?.subscription_type || 'normal',
            subscription_status: profile?.subscription_status || 'inactive'
        };
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