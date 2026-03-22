'use strict';

// We pull from process.env INSIDE the function to ensure we get the latest Render values
function requireRole(role) {
    return (req, res, next) => {
        const key = req.headers['x-api-key'];

        // Get fresh values from environment
        const adminKey = process.env.ADMIN_API_KEY;
        const userKey = process.env.USER_API_KEY;

        if (!key) {
            console.error(`[AUTH] Blocked: No x-api-key header provided.`);
            return res.status(401).json({ error: 'Missing API key' });
        }

        if (role === 'admin') {
            // Check if admin key exists in Env AND matches
            if (!adminKey || key !== adminKey) {
                console.error(`[AUTH] Admin Denied. Expected: ${adminKey ? 'Set' : 'MISSING IN RENDER'}`);
                return res.status(403).json({ error: 'Admin access required' });
            }
        }

        if (role === 'user') {
            // Users can be validated by user key OR admin key
            const isValidUser = (key === userKey) || (key === adminKey);
            if (!isValidUser) {
                console.error(`[AUTH] User Denied.`);
                return res.status(403).json({ error: 'User access required' });
            }
        }

        next();
    };
}

module.exports = {
    requireRole
};