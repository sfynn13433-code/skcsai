'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const serverPath = path.join(rootDir, 'backend', 'server-express.js');
const backendEnvPath = path.join(rootDir, 'backend', '.env');
const smokePort = String(process.env.SMOKE_PORT || process.env.PORT || '3000');
const baseUrl = `http://127.0.0.1:${smokePort}`;

function parseEnvFile(filePath) {
    if (!fs.existsSync(filePath)) return {};
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    const env = {};

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx === -1) continue;
        const key = trimmed.slice(0, idx).trim();
        let value = trimmed.slice(idx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        env[key] = value;
    }

    return env;
}

async function waitForServer(timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const res = await fetch(`${baseUrl}/health`);
            if (res.ok) return;
        } catch (_) {
            // Keep retrying until timeout.
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Server did not become ready within timeout');
}

async function fetchJson(url, options = {}) {
    const res = await fetch(url, options);
    const text = await res.text();
    let body = null;

    try {
        body = text ? JSON.parse(text) : null;
    } catch (_) {
        body = text;
    }

    return { res, body };
}

async function run() {
    const env = {
        ...process.env,
        ...parseEnvFile(backendEnvPath),
        PORT: smokePort
    };

    const server = spawn(process.execPath, [serverPath], {
        cwd: rootDir,
        env,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    server.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    server.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    try {
        await waitForServer();

        const pages = [
            '/',
            '/login.html',
            '/subscription.html',
            '/accuracy.html',
            '/terms.html',
            '/privacy.html'
        ];

        for (const page of pages) {
            const res = await fetch(`${baseUrl}${page}`);
            if (!res.ok) throw new Error(`Page failed: ${page} -> ${res.status}`);
        }

        const health = await fetchJson(`${baseUrl}/health`);
        if (health.res.status !== 200 || health.body?.status !== 'ok') {
            throw new Error('Health endpoint did not return expected payload');
        }

        const apiInfo = await fetchJson(`${baseUrl}/api`);
        if (apiInfo.res.status !== 200 || apiInfo.body?.status !== 'running') {
            throw new Error('API info endpoint did not return running status');
        }

        const accuracy = await fetchJson(`${baseUrl}/api/accuracy`);
        if (accuracy.res.status !== 200 || typeof accuracy.body?.overall?.winRate !== 'number') {
            throw new Error('Accuracy endpoint did not return the expected structure');
        }

        const predictions = await fetchJson(`${baseUrl}/api/predictions?sport=football&plan_id=elite_30day_deep_vip`, {
            headers: {
                'x-api-key': env.USER_API_KEY || 'skcs_user_12345'
            }
        });

        if (predictions.res.status !== 200 || !Array.isArray(predictions.body?.predictions)) {
            throw new Error('Predictions endpoint did not return a predictions array');
        }

        const unauthPredictions = await fetch(`${baseUrl}/api/predictions?sport=football&plan_id=elite_30day_deep_vip`);
        if (unauthPredictions.status !== 401) {
            throw new Error(`Unauthenticated predictions endpoint should return 401, got ${unauthPredictions.status}`);
        }

        const cors = await fetch(`${baseUrl}/cors-test`, {
            headers: {
                Origin: 'https://skcs-sports-edge.github.io',
                'x-api-key': env.USER_API_KEY || 'skcs_user_12345'
            }
        });
        if (cors.status !== 200 || cors.headers.get('access-control-allow-origin') !== 'https://skcs-sports-edge.github.io') {
            throw new Error('CORS test endpoint did not approve the expected frontend origin');
        }

        const billing = await fetchJson(`${baseUrl}/api/billing-status`);
        if (billing.res.status !== 200 || typeof billing.body?.billing_enabled !== 'boolean') {
            throw new Error('Billing status endpoint did not return the expected payload');
        }

        console.log('Smoke test passed');
    } finally {
        server.kill('SIGTERM');
        await new Promise((resolve) => setTimeout(resolve, 300));
        if (!server.killed) server.kill('SIGKILL');
        if (stderr.trim()) {
            process.stderr.write(stderr);
        }
        if (process.env.DEBUG_SMOKE === '1' && stdout.trim()) {
            process.stdout.write(stdout);
        }
    }
}

run().catch((err) => {
    console.error(err.stack || err.message);
    process.exit(1);
});
