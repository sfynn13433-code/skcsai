'use strict';

const { query } = require('./db');

async function bootstrap() {
    console.log('[dbBootstrap] Ensuring tables and seed data exist...');

    try {
        // Create tables if they don't exist
        await query(`
            CREATE TABLE IF NOT EXISTS predictions_raw (
                id bigserial PRIMARY KEY,
                match_id text NOT NULL,
                sport text NOT NULL,
                market text NOT NULL,
                prediction text NOT NULL,
                confidence numeric NOT NULL,
                volatility text NOT NULL,
                odds numeric,
                metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
                created_at timestamptz NOT NULL DEFAULT now()
            );
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS predictions_filtered (
                id bigserial PRIMARY KEY,
                raw_id bigint NOT NULL REFERENCES predictions_raw(id) ON DELETE CASCADE,
                tier text NOT NULL CHECK (tier IN ('normal', 'deep')),
                is_valid boolean NOT NULL,
                reject_reason text,
                created_at timestamptz NOT NULL DEFAULT now(),
                UNIQUE (raw_id, tier)
            );
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS predictions_final (
                id bigserial PRIMARY KEY,
                tier text NOT NULL CHECK (tier IN ('normal', 'deep')),
                type text NOT NULL CHECK (type IN ('single', 'acca')),
                matches jsonb NOT NULL,
                total_confidence numeric NOT NULL,
                risk_level text NOT NULL CHECK (risk_level IN ('safe', 'medium')),
                created_at timestamptz NOT NULL DEFAULT now()
            );
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS tier_rules (
                tier text PRIMARY KEY CHECK (tier IN ('normal', 'deep')),
                min_confidence numeric NOT NULL,
                allowed_markets jsonb NOT NULL,
                max_acca_size integer NOT NULL,
                allowed_volatility jsonb NOT NULL
            );
        `);

        await query(`
            CREATE TABLE IF NOT EXISTS acca_rules (
                id bigserial PRIMARY KEY,
                rule_name text NOT NULL UNIQUE,
                rule_value jsonb NOT NULL
            );
        `);

        // Seed tier_rules
        await query(`
            INSERT INTO tier_rules (tier, min_confidence, allowed_markets, max_acca_size, allowed_volatility)
            VALUES
                ('normal', 60, '["1X2","double_chance","over_2_5","btts_yes"]'::jsonb, 3, '["low","medium"]'::jsonb),
                ('deep', 75, '["ALL"]'::jsonb, 5, '["low"]'::jsonb)
            ON CONFLICT (tier) DO UPDATE SET
                min_confidence = EXCLUDED.min_confidence,
                allowed_markets = EXCLUDED.allowed_markets,
                max_acca_size = EXCLUDED.max_acca_size,
                allowed_volatility = EXCLUDED.allowed_volatility;
        `);

        // Seed acca_rules
        await query(`
            INSERT INTO acca_rules (rule_name, rule_value)
            VALUES
                ('no_same_match', 'true'::jsonb),
                ('no_conflicting_markets', 'true'::jsonb),
                ('max_per_match', '1'::jsonb),
                ('allow_high_volatility', 'false'::jsonb)
            ON CONFLICT (rule_name) DO UPDATE SET
                rule_value = EXCLUDED.rule_value;
        `);

        console.log('[dbBootstrap] All tables and seed data verified.');
    } catch (err) {
        console.error('[dbBootstrap] Error:', err.message);
    }
}

module.exports = { bootstrap };
