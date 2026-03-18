'use strict';

const API_KEYS = {
    admin: process.env.ADMIN_API_KEY,
    user: process.env.USER_API_KEY
};

function requireRole(role) {
    return (req, res, next) => {
        const key = req.headers['x-api-key'];

        if (!key) {
            res.status(401).json({ error: 'Missing API key' });
            return;
        }

        if (role === 'admin' && key !== API_KEYS.admin) {
            res.status(403).json({ error: 'Admin access required' });
            return;
        }

        if (role === 'user' && key !== API_KEYS.user && key !== API_KEYS.admin) {
            res.status(403).json({ error: 'User access required' });
            return;
        }

        next();
    };
}

module.exports = {
    requireRole
};
