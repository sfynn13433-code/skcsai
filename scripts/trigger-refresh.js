'use strict';

require('dotenv').config();

function parseArgs(argv) {
    const args = {};

    for (const arg of argv) {
        if (!arg.startsWith('--')) continue;
        const eqIndex = arg.indexOf('=');
        if (eqIndex === -1) {
            args[arg.slice(2)] = 'true';
            continue;
        }
        args[arg.slice(2, eqIndex)] = arg.slice(eqIndex + 1);
    }

    return args;
}

function normalizeHost(value) {
    if (!value) return null;
    return String(value).trim().replace(/\/+$/, '');
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const host = normalizeHost(args.host || process.env.SKCS_REFRESH_HOST);
    const sport = String(args.sport || process.env.SKCS_REFRESH_SPORT || 'football').toLowerCase();
    const apiKey = args['api-key'] || process.env.SKCS_REFRESH_KEY;
    const timeoutMs = Number(args.timeout || process.env.SKCS_REFRESH_TIMEOUT_MS || 120000);

    if (!host) {
        throw new Error('Missing refresh host. Set SKCS_REFRESH_HOST or pass --host=https://your-backend');
    }
    if (!apiKey) {
        throw new Error('Missing refresh API key. Set SKCS_REFRESH_KEY or pass --api-key=...');
    }

    const url = new URL('/api/refresh-predictions', host);
    if (sport) url.searchParams.set('sport', sport);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url.toString(), {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'content-type': 'application/json'
            },
            signal: controller.signal
        });

        const bodyText = await response.text();
        let payload = null;
        try {
            payload = bodyText ? JSON.parse(bodyText) : null;
        } catch {
            payload = { raw: bodyText };
        }

        if (!response.ok) {
            const error = new Error(`Refresh failed with status ${response.status}`);
            error.response = payload;
            throw error;
        }

        console.log(JSON.stringify({
            ok: true,
            requestedSport: sport,
            host,
            status: response.status,
            payload
        }, null, 2));
    } finally {
        clearTimeout(timer);
    }
}

main().catch((error) => {
    console.error(JSON.stringify({
        ok: false,
        error: error.message,
        response: error.response || null
    }, null, 2));
    process.exit(1);
});
