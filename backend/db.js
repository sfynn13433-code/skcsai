'use strict';

const { Pool } = require('pg');
const config = require('./config');

if (!config?.database?.url) {
    console.warn('[db] DATABASE_URL is not set. Database operations will fail until it is configured.');
}

const pool = new Pool({
    connectionString: config?.database?.url,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
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
