-- SKCS Database Schema Refactor
-- Normalized fixture handling and prediction pipeline
-- Supports subscription matrix and proper date/timezone handling

-- ============================================================================
-- 1. NORMALIZED FIXTURES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS normalized_fixtures (
    id BIGSERIAL PRIMARY KEY,
    
    -- Core fixture identification
    sport VARCHAR(50) NOT NULL,
    provider_fixture_id VARCHAR(255) NOT NULL,
    provider_name VARCHAR(100) DEFAULT 'the_odds_api',
    
    -- Match details
    home_team VARCHAR(255) NOT NULL,
    away_team VARCHAR(255) NOT NULL,
    league_id VARCHAR(100),
    league_name VARCHAR(255),
    season VARCHAR(50),
    venue VARCHAR(255),
    
    -- Normalized timestamps (CRITICAL: All timezone handling)
    kickoff_utc TIMESTAMPTZ NOT NULL,
    kickoff_sast TIMESTAMPTZ NOT NULL, -- South Africa Standard Time
    match_date_sast DATE NOT NULL, -- Date in SAST timezone
    match_time_sast TIME NOT NULL, -- Time in SAST timezone
    
    -- Prediction eligibility flags
    is_same_day BOOLEAN DEFAULT FALSE,
    is_within_2h BOOLEAN DEFAULT FALSE,
    is_acca_eligible BOOLEAN DEFAULT TRUE,
    is_same_match_eligible BOOLEAN DEFAULT TRUE,
    is_multi_eligible BOOLEAN DEFAULT TRUE,
    
    -- Status and metadata
    status VARCHAR(50) DEFAULT 'scheduled', -- scheduled, cancelled, postponed, finished
    confidence_score REAL,
    volatility_level VARCHAR(20) DEFAULT 'medium', -- low, medium, high
    metadata_json JSONB DEFAULT '{}',
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_sync_at TIMESTAMPTZ,
    
    -- Constraints
    UNIQUE(sport, provider_fixture_id),
    CONSTRAINT valid_kickoff_utc CHECK (kickoff_utc IS NOT NULL),
    CONSTRAINT valid_status CHECK (status IN ('scheduled', 'cancelled', 'postponed', 'finished')),
    CONSTRAINT valid_volatility CHECK (volatility_level IN ('low', 'medium', 'high'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_normalized_fixtures_sport_date ON normalized_fixtures(sport, match_date_sast);
CREATE INDEX IF NOT EXISTS idx_normalized_fixtures_kickoff_utc ON normalized_fixtures(kickoff_utc);
CREATE INDEX IF NOT EXISTS idx_normalized_fixtures_status ON normalized_fixtures(status);
CREATE INDEX IF NOT EXISTS idx_normalized_fixtures_eligibility ON normalized_fixtures(is_same_day, is_within_2h);
CREATE INDEX IF NOT EXISTS idx_normalized_fixtures_provider ON normalized_fixtures(provider_name, provider_fixture_id);

-- ============================================================================
-- 2. PREDICTION PIPELINE STAGES
-- ============================================================================

-- Stage 1: Initial baseline predictions
CREATE TABLE IF NOT EXISTS predictions_stage_1 (
    id BIGSERIAL PRIMARY KEY,
    fixture_id BIGINT REFERENCES normalized_fixtures(id) ON DELETE CASCADE,
    
    sport VARCHAR(50) NOT NULL,
    market_type VARCHAR(100) NOT NULL, -- 1X2, over_2_5, btts_yes, etc.
    recommendation VARCHAR(255) NOT NULL, -- Home Win, Over 2.5, etc.
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
    risk_level VARCHAR(20) DEFAULT 'medium', -- safe, medium, high
    
    -- Stage 1 specific fields
    baseline_probability REAL,
    implied_odds REAL,
    market_efficiency_score REAL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

-- Stage 2: Deep context analysis
CREATE TABLE IF NOT EXISTS predictions_stage_2 (
    id BIGSERIAL PRIMARY KEY,
    stage_1_id BIGINT REFERENCES predictions_stage_1(id) ON DELETE CASCADE,
    fixture_id BIGINT REFERENCES normalized_fixtures(id) ON DELETE CASCADE,
    
    -- Adjusted predictions after context analysis
    adjusted_confidence REAL CHECK (adjusted_confidence >= 0 AND adjusted_confidence <= 100),
    confidence_adjustment REAL DEFAULT 0, -- +/- points from stage 1
    
    -- Context factors
    team_form_impact REAL,
    injury_impact REAL,
    suspension_impact REAL,
    home_advantage_impact REAL,
    weather_impact REAL,
    
    -- Elite-only analysis
    deep_analysis_score REAL,
    volatility_adjustment REAL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

-- Stage 3: Reality check and final validation
CREATE TABLE IF NOT EXISTS predictions_stage_3 (
    id BIGSERIAL PRIMARY KEY,
    stage_2_id BIGINT REFERENCES predictions_stage_2(id) ON DELETE CASCADE,
    fixture_id BIGINT REFERENCES normalized_fixtures(id) ON DELETE CASCADE,
    
    -- Final validated predictions
    final_confidence REAL CHECK (final_confidence >= 0 AND final_confidence <= 100),
    validation_score REAL,
    
    -- Reality check factors
    news_sentiment_impact REAL,
    travel_fatigue_impact REAL,
    schedule_congestion_impact REAL,
    external_factors JSONB DEFAULT '{}',
    
    -- Risk assessment
    risk_flags JSONB DEFAULT '[]', -- Array of risk flags
    volatility_score REAL DEFAULT 0.5,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

-- ============================================================================
-- 3. FINAL PREDICTIONS WITH PLAN VISIBILITY
-- ============================================================================
CREATE TABLE IF NOT EXISTS predictions_final (
    id BIGSERIAL PRIMARY KEY,
    fixture_id BIGINT REFERENCES normalized_fixtures(id) ON DELETE CASCADE,
    stage_3_id BIGINT REFERENCES predictions_stage_3(id) ON DELETE CASCADE,
    
    sport VARCHAR(50) NOT NULL,
    market_type VARCHAR(100) NOT NULL,
    recommendation VARCHAR(255) NOT NULL,
    confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 100),
    risk_level VARCHAR(20) DEFAULT 'medium',
    
    -- Prediction categorization
    prediction_type VARCHAR(50) NOT NULL, -- direct, secondary, multi, same_match, acca
    minimum_required_plan VARCHAR(100), -- core_4day_sprint, elite_30day_deep_vip, etc.
    
    -- ACCA and same-day logic
    is_same_day BOOLEAN DEFAULT FALSE,
    is_within_2h BOOLEAN DEFAULT FALSE,
    is_acca_eligible BOOLEAN DEFAULT FALSE,
    is_same_match_eligible BOOLEAN DEFAULT FALSE,
    is_multi_eligible BOOLEAN DEFAULT FALSE,
    
    -- Plan visibility (JSON array of plan IDs that can see this prediction)
    plan_visibility JSONB DEFAULT '[]',
    
    -- Metadata
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_prediction_type CHECK (prediction_type IN ('direct', 'secondary', 'multi', 'same_match', 'acca')),
    CONSTRAINT valid_risk_level CHECK (risk_level IN ('safe', 'medium', 'high'))
);

-- Indexes for final predictions
CREATE INDEX IF NOT EXISTS idx_predictions_final_sport_type ON predictions_final(sport, prediction_type);
CREATE INDEX IF NOT EXISTS idx_predictions_final_plan_visibility ON predictions_final USING GIN(plan_visibility);
CREATE INDEX IF NOT EXISTS idx_predictions_final_confidence ON predictions_final(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_final_eligibility ON predictions_final(is_same_day, is_within_2h);
CREATE INDEX IF NOT EXISTS idx_predictions_final_expires ON predictions_final(expires_at);

-- ============================================================================
-- 4. SUBSCRIPTION PLAN MATRIX
-- ============================================================================
CREATE TABLE IF NOT EXISTS subscription_plans (
    plan_id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    tier VARCHAR(20) NOT NULL CHECK (tier IN ('core', 'elite')),
    duration_days INTEGER NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    
    -- Daily allocations (JSON object)
    daily_allocations JSONB NOT NULL,
    
    -- Capabilities
    capabilities JSONB NOT NULL,
    
    -- Status
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 5. PREDICTION RESULTS TRACKING
-- ============================================================================
CREATE TABLE IF NOT EXISTS prediction_results (
    id BIGSERIAL PRIMARY KEY,
    prediction_id BIGINT REFERENCES predictions_final(id) ON DELETE CASCADE,
    fixture_id BIGINT REFERENCES normalized_fixtures(id) ON DELETE CASCADE,
    
    sport VARCHAR(50) NOT NULL,
    market_type VARCHAR(100) NOT NULL,
    prediction VARCHAR(255) NOT NULL,
    actual_outcome VARCHAR(255),
    
    status VARCHAR(20) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Win', 'Loss', 'Pending', 'Void')),
    confidence_at_time REAL,
    odds_at_time REAL,
    
    settled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 6. SCHEDULING LOGS
-- ============================================================================
CREATE TABLE IF NOT EXISTS scheduling_logs (
    id BIGSERIAL PRIMARY KEY,
    schedule_type VARCHAR(50) NOT NULL, -- morning, midday, evening
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    
    -- Pipeline statistics
    fixtures_imported INTEGER DEFAULT 0,
    fixtures_normalized INTEGER DEFAULT 0,
    predictions_generated INTEGER DEFAULT 0,
    predictions_filtered INTEGER DEFAULT 0,
    
    -- Status
    status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    error_message TEXT,
    
    -- Timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'
);

-- ============================================================================
-- 7. DATABASE FUNCTIONS
-- ============================================================================

-- Function to normalize fixture dates
CREATE OR REPLACE FUNCTION normalize_fixture_dates()
RETURNS TRIGGER AS $$
BEGIN
    -- Convert kickoff_utc to SAST
    NEW.kickoff_sast := NEW.kickoff_utc AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Johannesburg';
    NEW.match_date_sast := DATE(NEW.kickoff_sast);
    NEW.match_time_sast := TIME(NEW.kickoff_sast);
    
    -- Set eligibility flags based on current time
    NEW.is_same_day := (DATE(NEW.kickoff_sast) = CURRENT_DATE AT TIME ZONE 'Africa/Johannesburg');
    NEW.is_within_2h := (
        NEW.kickoff_utc <= (NOW() AT TIME ZONE 'UTC' + INTERVAL '2 hours') AND
        NEW.kickoff_utc > NOW() AT TIME ZONE 'UTC'
    );
    
    -- Update timestamp
    NEW.updated_at := NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic date normalization
DROP TRIGGER IF EXISTS trg_normalize_fixture_dates ON normalized_fixtures;
CREATE TRIGGER trg_normalize_fixture_dates
    BEFORE INSERT OR UPDATE ON normalized_fixtures
    FOR EACH ROW EXECUTE FUNCTION normalize_fixture_dates();

-- Function to get prediction window
CREATE OR REPLACE FUNCTION get_prediction_window(p_current_time TIMESTAMPTZ DEFAULT NOW())
RETURNS JSONB AS $$
DECLARE
    v_sast_time TIMESTAMPTZ;
    v_hour INTEGER;
    v_window_start TIMESTAMPTZ;
    v_window_end TIMESTAMPTZ;
    v_current_window TEXT;
BEGIN
    -- Convert to SAST
    v_sast_time := p_current_time AT TIME ZONE 'Africa/Johannesburg';
    v_hour := EXTRACT(HOUR FROM v_sast_time);
    
    -- Determine window and fetch range
    IF v_hour >= 4 AND v_hour < 12 THEN
        -- Morning window: fetch today
        v_current_window := 'morning';
        v_window_start := (DATE(v_sast_time) AT TIME ZONE 'Africa/Johannesburg') AT TIME ZONE 'UTC';
        v_window_end := v_window_start + INTERVAL '1 day' - INTERVAL '1 second';
    ELSIF v_hour >= 12 AND v_hour < 18 THEN
        -- Midday window: fetch today + tomorrow
        v_current_window := 'midday';
        v_window_start := (DATE(v_sast_time) AT TIME ZONE 'Africa/Johannesburg') AT TIME ZONE 'UTC';
        v_window_end := v_window_start + INTERVAL '2 days' - INTERVAL '1 second';
    ELSE
        -- Evening window: fetch tomorrow + day after
        v_current_window := 'evening';
        v_window_start := (DATE(v_sast_time) + INTERVAL '1 day') AT TIME ZONE 'Africa/Johannesburg' AT TIME ZONE 'UTC';
        v_window_end := v_window_start + INTERVAL '2 days' - INTERVAL '1 second';
    END IF;
    
    RETURN JSONB_BUILD_OBJECT(
        'current_window', v_current_window,
        'current_time_sast', v_sast_time,
        'fetch_range_utc', JSONB_BUILD_OBJECT(
            'start', v_window_start,
            'end', v_window_end
        ),
        'fetch_range_sast', JSONB_BUILD_OBJECT(
            'start', v_window_start AT TIME ZONE 'Africa/Johannesburg',
            'end', v_window_end AT TIME ZONE 'Africa/Johannesburg'
        )
    );
END;
$$ LANGUAGE plpgsql;

-- Function to filter predictions for a specific plan
CREATE OR REPLACE FUNCTION filter_predictions_for_plan(
    p_plan_id TEXT,
    p_window_start TIMESTAMPTZ,
    p_window_end TIMESTAMPTZ
)
RETURNS TABLE (
    prediction_id BIGINT,
    sport TEXT,
    market_type TEXT,
    recommendation TEXT,
    confidence REAL,
    prediction_type TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        pf.id,
        pf.sport,
        pf.market_type,
        pf.recommendation,
        pf.confidence,
        pf.prediction_type
    FROM predictions_final pf
    JOIN normalized_fixtures nf ON pf.fixture_id = nf.id
    JOIN subscription_plans sp ON sp.plan_id = p_plan_id
    WHERE 
        nf.kickoff_utc BETWEEN p_window_start AND p_window_end
        AND sp.active = TRUE
        AND (
            -- Plan is in visibility array OR meets minimum plan requirement
            (pf.plan_visibility ? p_plan_id) OR
            (pf.minimum_required_plan IS NULL) OR
            (pf.minimum_required_plan = p_plan_id)
        )
        AND pf.expires_at > NOW()
    ORDER BY pf.confidence DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 8. INITIAL DATA SEEDING
-- ============================================================================

-- Insert subscription plans (will be updated by application)
INSERT INTO subscription_plans (plan_id, name, tier, duration_days, price, daily_allocations, capabilities) VALUES
('core_4day_sprint', '4-Day Sprint', 'core', 4, 3.99,
 '{"monday":{"direct":6,"secondary":4,"multi":2,"same_match":2,"acca_6match":1},"tuesday":{"direct":6,"secondary":4,"multi":2,"same_match":2,"acca_6match":1},"wednesday":{"direct":8,"secondary":5,"multi":3,"same_match":2,"acca_6match":1},"thursday":{"direct":8,"secondary":5,"multi":3,"same_match":2,"acca_6match":1},"friday":{"direct":10,"secondary":6,"multi":3,"same_match":3,"acca_6match":2},"saturday":{"direct":15,"secondary":8,"multi":5,"same_match":5,"acca_6match":3},"sunday":{"direct":12,"secondary":7,"multi":4,"same_match":4,"acca_6match":2}}'::JSONB,
 '{"daily_multiplier":0.4,"chatbot_daily_limit":10,"acca_eligibility":"restricted","sports_coverage":["football","basketball","tennis","cricket"],"market_access":["1X2","double_chance","over_2_5","btts_yes"]}'::JSONB
),
('elite_30day_deep_vip', '30-Day Deep VIP', 'elite', 30, 59.99,
 '{"monday":{"direct":15,"secondary":12,"multi":8,"same_match":8,"acca_6match":5},"tuesday":{"direct":15,"secondary":12,"multi":8,"same_match":8,"acca_6match":5},"wednesday":{"direct":22,"secondary":15,"multi":10,"same_match":10,"acca_6match":7},"thursday":{"direct":22,"secondary":15,"multi":10,"same_match":10,"acca_6match":7},"friday":{"direct":30,"secondary":18,"multi":12,"same_match":12,"acca_6match":10},"saturday":{"direct":45,"secondary":25,"multi":18,"same_match":18,"acca_6match":15},"sunday":{"direct":35,"secondary":22,"multi":15,"same_match":15,"acca_6match":12}}'::JSONB,
 '{"daily_multiplier":1.0,"chatbot_daily_limit":50,"acca_eligibility":"full","deep_analysis_weighting":true,"elite_only_filtering":true,"sports_coverage":"all","market_access":"all","priority_support":true,"historical_data_depth":"unlimited"}'::JSONB
)
ON CONFLICT (plan_id) DO NOTHING;

-- ============================================================================
-- 9. VIEWS FOR COMMON QUERIES
-- ============================================================================

-- View for active predictions by sport
CREATE OR REPLACE VIEW active_predictions_by_sport AS
SELECT 
    nf.sport,
    pf.prediction_type,
    COUNT(*) as prediction_count,
    AVG(pf.confidence) as avg_confidence,
    MAX(pf.confidence) as max_confidence,
    MIN(pf.confidence) as min_confidence
FROM predictions_final pf
JOIN normalized_fixtures nf ON pf.fixture_id = nf.id
WHERE 
    nf.kickoff_utc > NOW()
    AND pf.expires_at > NOW()
    AND nf.status = 'scheduled'
GROUP BY nf.sport, pf.prediction_type
ORDER BY nf.sport, prediction_type;

-- View for today's predictions
CREATE OR REPLACE VIEW todays_predictions AS
SELECT 
    pf.*,
    nf.home_team,
    nf.away_team,
    nf.league_name,
    nf.kickoff_sast,
    nf.match_time_sast,
    nf.is_same_day,
    nf.is_within_2h
FROM predictions_final pf
JOIN normalized_fixtures nf ON pf.fixture_id = nf.id
WHERE 
    nf.match_date_sast = CURRENT_DATE AT TIME ZONE 'Africa/Johannesburg'
    AND nf.status = 'scheduled'
    AND pf.expires_at > NOW()
ORDER BY nf.kickoff_sast, pf.confidence DESC;
