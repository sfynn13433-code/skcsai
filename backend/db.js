'use strict';

require('dotenv').config();

const { Pool } = require('pg');
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.warn('[db] DATABASE_URL is not set. Database operations will fail until it is configured.');
}

function shouldUseSsl(databaseUrl) {
    try {
        const url = new URL(databaseUrl);
        const host = (url.hostname || '').toLowerCase();
        if (host === 'localhost' || host === '127.0.0.1') return false;
        return true;
    } catch {
        return true;
    }
}

function summarizeDatabaseUrl(databaseUrl) {
    try {
        const url = new URL(databaseUrl);
        return {
            protocol: url.protocol,
            host: url.hostname || null,
            port: url.port || null,
            database: url.pathname ? url.pathname.replace(/^\//, '') : null,
            username: url.username || null,
            sslmode: url.searchParams.get('sslmode') || null,
            pgbouncer: url.searchParams.get('pgbouncer') || null
        };
    } catch (error) {
        return {
            parse_error: error?.message || 'Unable to parse DATABASE_URL'
        };
    }
}

if (connectionString) {
    console.log('[db] DATABASE_URL runtime summary:', summarizeDatabaseUrl(connectionString));
}

const pool = connectionString
    ? new Pool({
        connectionString,
        max: 10,
        idleTimeoutMillis: 30_000,
        connectionTimeoutMillis: 5_000,
        ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : false
    })
    : null;

if (pool) {
    pool.on('error', (err) => {
        console.error('[db] Pool error:', err);
    });

    (async () => {
        try {
            const result = await pool.query('SELECT 1 AS ok');
            console.log('[db] PostgreSQL connection test OK:', result.rows?.[0]?.ok);
        } catch (err) {
            console.error('[db] PostgreSQL connection test FAILED:', {
                message: err?.message,
                code: err?.code,
                detail: err?.detail,
                hint: err?.hint
            });
            if (err?.code === '28P01') {
                console.error('[db] DATABASE AUTH CHECK: verify the Render DATABASE_URL value and URL-encode any special characters in the password.');
            }
        }
    })();
}

async function query(text, params) {
    if (!pool) {
        throw new Error('DATABASE_URL is not configured');
    }
    return pool.query(text, params);
}

async function withTransaction(fn) {
    if (!pool) {
        throw new Error('DATABASE_URL is not configured');
    }
    const client = await pool.connect();
    try {
        await client.query('begin');
        const result = await fn(client);
        await client.query('commit');
        return result;
    } catch (err) {
        try {
            await client.query('rollback');
        } catch (rollbackErr) {
            console.error('[db] Rollback error:', rollbackErr);
        }
        throw err;
    } finally {
        client.release();
    }
}

module.exports = {
    pool,
    query,
    withTransaction
};
