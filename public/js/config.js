// Config file to route API requests to Localhost or Production Render API
// The domain should automatically switch so testing doesn't break production

const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// Replace the fallback with the Render API URL or any other production backend URL
window.API_BASE_URL = IS_LOCAL ? 'http://localhost:3000' : 'https://skcsai.onrender.com';

console.log(`[SKCS] API routing set to: ${window.API_BASE_URL}`);
