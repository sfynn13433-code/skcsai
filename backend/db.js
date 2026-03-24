'use strict';

const { Pool } = require('pg');
const config = require('./config');

if (!config?.database?.url) {
    console.warn('[db] DATABASE_URL is not set. Database operations will fail until it is configured.');
}

// Auto-convert direct Supabase URL to pooler URL to fix auth errors
let connectionString = config?.database?.url || '';
if (connectionString.includes('db.ghzjntdvaptuxfpvhybb.supabase.co')) {
    connectionString = connectionString
        .replace('db.ghzjntdvaptuxfpvhybb.supabase.co:5432', 'aws-1-eu-central-1.pooler.supabase.com:6543')
        .replace('postgres:', 'postgres.ghzjntdvaptuxfpvhybb:');
    if (!connectionString.includes('pgbouncer=')) {
        connectionString += (connectionString.includes('?') ? '&' : '?') + 'pgbouncer=true';
    }
    console.log('[db] Auto-converted to Supabase pooler URL');
}

const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: connectionString ? { rejectUnauthorized: false } : undefined
});

pool.on('error', (err) => {
    console.error('[db] Pool error:', err);
});

async function query(text, params) {
    return pool.query(text, params);
}

async function withTransaction(fn) {
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
