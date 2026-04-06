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

function defaultGradeDate() {
    const now = new Date();
    const sastNow = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Johannesburg' }));
    sastNow.setDate(sastNow.getDate() - 1);
    const yyyy = sastNow.getFullYear();
    const mm = String(sastNow.getMonth() + 1).padStart(2, '0');
    const dd = String(sastNow.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const host = normalizeHost(args.host || process.env.SKCS_REFRESH_HOST);
    const sport = String(args.sport || process.env.SKCS_REFRESH_SPORT || 'football').toLowerCase();
    const date = String(args.date || process.env.SKCS_GRADE_DATE || defaultGradeDate());
    const runId = args['run-id'] || process.env.SKCS_GRADE_RUN_ID || null;
    const apiKey = args['api-key'] || process.env.SKCS_REFRESH_KEY;
    const timeoutMs = Number(args.timeout || process.env.SKCS_REFRESH_TIMEOUT_MS || 1800000);

    if (!host) {
        throw new Error('Missing grading host. Set SKCS_REFRESH_HOST or pass --host=https://your-backend');
    }
    if (!apiKey) {
        throw new Error('Missing grading API key. Set SKCS_REFRESH_KEY or pass --api-key=...');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error(`Invalid grading date: ${date}. Expected YYYY-MM-DD.`);
    }

    const url = new URL('/api/grade-predictions', host);
    url.searchParams.set('sport', sport);
    url.searchParams.set('date', date);
    if (runId) url.searchParams.set('run_id', runId);

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
            const error = new Error(`Grading failed with status ${response.status}`);
            error.response = payload;
            throw error;
        }

        console.log(JSON.stringify({
            ok: true,
            requestedSport: sport,
            date,
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
