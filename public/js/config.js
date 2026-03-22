// Force the API to point to Render, regardless of where the site is hosted
window.API_BASE_URL = "https://skcsai.onrender.com"; 

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