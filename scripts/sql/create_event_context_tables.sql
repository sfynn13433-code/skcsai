CREATE TABLE IF NOT EXISTS public.event_injury_snapshots (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT NOT NULL,
    sport TEXT NOT NULL,
    fixture_provider_id BIGINT,
    fixture_date DATE,
    kickoff_time TIMESTAMPTZ,
    team_provider_id TEXT,
    team_name TEXT,
    player_provider_id TEXT,
    player_name TEXT,
    status_type TEXT,
    status_reason TEXT,
    source TEXT NOT NULL DEFAULT 'API-SPORTS',
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, team_provider_id, player_provider_id, status_type, status_reason)
);

CREATE INDEX IF NOT EXISTS idx_event_injury_snapshots_event_id
    ON public.event_injury_snapshots(event_id);

CREATE INDEX IF NOT EXISTS idx_event_injury_snapshots_fixture_date
    ON public.event_injury_snapshots(fixture_date);

CREATE TABLE IF NOT EXISTS public.event_weather_snapshots (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT NOT NULL UNIQUE,
    sport TEXT NOT NULL,
    fixture_date DATE,
    kickoff_time TIMESTAMPTZ,
    venue_name TEXT,
    venue_city TEXT,
    venue_country TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    resolved_timezone TEXT,
    temperature_c DOUBLE PRECISION,
    precipitation_mm DOUBLE PRECISION,
    wind_speed_kmh DOUBLE PRECISION,
    weather_code INTEGER,
    weather_summary TEXT,
    source TEXT NOT NULL DEFAULT 'open-meteo',
    geocode_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_weather_snapshots_fixture_date
    ON public.event_weather_snapshots(fixture_date);

CREATE TABLE IF NOT EXISTS public.event_news_snapshots (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT NOT NULL,
    sport TEXT NOT NULL,
    fixture_date DATE,
    kickoff_time TIMESTAMPTZ,
    team_name TEXT NOT NULL,
    opponent_name TEXT,
    signal_type TEXT NOT NULL,
    signal_label TEXT,
    signal_strength DOUBLE PRECISION,
    relevance_score DOUBLE PRECISION,
    sentiment_score DOUBLE PRECISION,
    evidence_keywords TEXT[] NOT NULL DEFAULT '{}'::text[],
    article_title TEXT NOT NULL,
    article_summary TEXT,
    article_url TEXT,
    source_name TEXT,
    source_url TEXT,
    published_at TIMESTAMPTZ,
    query_text TEXT,
    source TEXT NOT NULL DEFAULT 'google-news-rss',
    raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (event_id, team_name, signal_type, article_title, article_url)
);

CREATE INDEX IF NOT EXISTS idx_event_news_snapshots_event_id
    ON public.event_news_snapshots(event_id);

CREATE INDEX IF NOT EXISTS idx_event_news_snapshots_fixture_date
    ON public.event_news_snapshots(fixture_date);

CREATE INDEX IF NOT EXISTS idx_event_news_snapshots_team_name
    ON public.event_news_snapshots(team_name);
