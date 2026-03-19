'use strict';

const { createClient } = require('@supabase/supabase-js');
const config = require('../config');
const { getProfileById, upsertProfile } = require('../database');

const hasSupabaseConfig =
    typeof config?.supabase?.url === 'string' && config.supabase.url.trim().length > 0 &&
    typeof config?.supabase?.anonKey === 'string' && config.supabase.anonKey.trim().length > 0;

const supabase = hasSupabaseConfig
    ? createClient(config.supabase.url, config.supabase.anonKey)
    : null;

async function requireSupabaseUser(req, res, next) {
    if (!supabase) {
        res.status(500).json({ error: 'Supabase Auth is not configured (missing SUPABASE_URL / SUPABASE_ANON_KEY)' });
        return;
    }

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        res.status(401).json({ error: 'Access token required' });
        return;
    }

    try {
        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data?.user) {
            res.status(401).json({ error: 'Invalid or expired token' });
            return;
        }

        const supaUser = data.user;

        let profile = await getProfileById(supaUser.id);
        if (!profile) {
            profile = await upsertProfile({
                id: supaUser.id,
                email: supaUser.email,
                subscription_status: 'inactive',
                is_test_user: false
            });
        }

        req.user = {
            id: supaUser.id,
            email: supaUser.email,
            subscription_status: profile?.subscription_status || 'inactive',
            is_test_user: profile?.is_test_user || false,
            plan_id: profile?.plan_id || null,
            plan_tier: profile?.plan_tier || null,
            plan_expires_at: profile?.plan_expires_at || null
        };

        next();
    } catch (err) {
        console.error('[supabaseJwt] error:', err);
        res.status(401).json({ error: 'Invalid or expired token' });
    }
}

function requireActiveSubscription(req, res, next) {
    const user = req.user;

    if (!user) {
        res.status(401).json({ error: 'Access token required' });
        return;
    }

    if (user.subscription_status !== 'active' && user.is_test_user !== true) {
        res.status(403).json({ error: 'Subscription required' });
        return;
    }

    next();
}

module.exports = {
    requireSupabaseUser,
    requireActiveSubscription
};
