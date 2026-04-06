// Default to the live Render API, but allow an earlier override for migration tests.
window.API_BASE_URL = window.API_BASE_URL || "https://skcsai-z8cd.onrender.com";

// Safety check: ensure no trailing slash
if (window.API_BASE_URL.endsWith('/')) {
    window.API_BASE_URL = window.API_BASE_URL.slice(0, -1);
}

console.log(`[SKCS] API routing ACTIVE: ${window.API_BASE_URL}`);

// This ensures all your fetch calls across the site use this base
window.SKCS_CONFIG = {
    predictions: `${window.API_BASE_URL}/api/predictions`,
    matches: `${window.API_BASE_URL}/api/matches`,
    chat: `${window.API_BASE_URL}/api/chat`,
    subscribe: `${window.API_BASE_URL}/api/subscribe`
};

window.SUPABASE_URL = window.SUPABASE_URL || 'https://ghzjntdvaptuxfpvhybb.supabase.co';
window.SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoempudGR2YXB0dXhmcHZoeWJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNDAzNzIsImV4cCI6MjA4NzgxNjM3Mn0.nWxOY0lDIDDvexELk9De2aEfPfM5iJjoaW91tbL7YQk';

if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    console.error('[SKCS] Supabase config missing: window.SUPABASE_URL / window.SUPABASE_ANON_KEY must be set');
}
