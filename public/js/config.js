// Config file to route API requests to the correct backend
// When served from Render, API calls stay same-origin (empty string)
// When testing locally, API calls go to localhost:3000

const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// On production (Render serves both frontend + API), use same-origin (empty string)
// On localhost, point to the local Express server
window.API_BASE_URL = IS_LOCAL ? 'http://localhost:3000' : '';

console.log(`[SKCS] API routing set to: ${window.API_BASE_URL || '(same-origin)'}`);

