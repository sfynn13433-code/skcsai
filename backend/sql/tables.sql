create table if not exists predictions_raw (
    id bigserial primary key,
    match_id text not null,
    sport text not null,
    market text not null,
    prediction text not null,
    confidence numeric not null,
    volatility text not null,
    odds numeric,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create table if not exists predictions_filtered (
    id bigserial primary key,
    raw_id bigint not null references predictions_raw(id) on delete cascade,
    tier text not null check (tier in ('normal', 'deep')),
    is_valid boolean not null,
    reject_reason text,
    created_at timestamptz not null default now(),
    unique (raw_id, tier)
);

create table if not exists predictions_final (
    id bigserial primary key,
    tier text not null check (tier in ('normal', 'deep')),
    type text not null check (type in ('single', 'acca')),
    matches jsonb not null,
    total_confidence numeric not null,
    risk_level text not null check (risk_level in ('safe', 'medium')),
    created_at timestamptz not null default now()
);

create table if not exists tier_rules (
    tier text primary key check (tier in ('normal', 'deep')),
    min_confidence numeric not null,
    allowed_markets jsonb not null,
    max_acca_size integer not null,
    allowed_volatility jsonb not null
);

create table if not exists acca_rules (
    id bigserial primary key,
    rule_name text not null unique,
    rule_value jsonb not null
);
