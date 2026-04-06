CREATE TABLE IF NOT EXISTS public.predictions_accuracy (
    id BIGSERIAL PRIMARY KEY,
    prediction_final_id BIGINT NOT NULL REFERENCES public.predictions_final(id) ON DELETE CASCADE,
    publish_run_id BIGINT REFERENCES public.prediction_publish_runs(id) ON DELETE SET NULL,
    prediction_match_index INTEGER NOT NULL,
    event_id TEXT,
    sport TEXT NOT NULL,
    prediction_tier TEXT,
    prediction_type TEXT,
    confidence REAL,
    market TEXT,
    predicted_outcome TEXT NOT NULL,
    prediction_source TEXT,
    result_source TEXT,
    home_team TEXT,
    away_team TEXT,
    fixture_date DATE,
    actual_result TEXT,
    event_status TEXT NOT NULL DEFAULT 'pending',
    resolution_status TEXT NOT NULL DEFAULT 'pending' CHECK (
        resolution_status IN ('pending', 'won', 'lost', 'void', 'unsupported', 'missing_event')
    ),
    is_correct BOOLEAN,
    actual_home_score INTEGER,
    actual_away_score INTEGER,
    actual_home_score_ht INTEGER,
    actual_away_score_ht INTEGER,
    loss_reason_summary TEXT,
    loss_factors JSONB NOT NULL DEFAULT '[]'::jsonb,
    evaluation_notes TEXT,
    diagnostic_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    raw_result JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (prediction_final_id, prediction_match_index)
);

ALTER TABLE public.predictions_accuracy
    ADD COLUMN IF NOT EXISTS publish_run_id BIGINT,
    ADD COLUMN IF NOT EXISTS prediction_tier TEXT,
    ADD COLUMN IF NOT EXISTS prediction_type TEXT,
    ADD COLUMN IF NOT EXISTS confidence REAL,
    ADD COLUMN IF NOT EXISTS loss_reason_summary TEXT,
    ADD COLUMN IF NOT EXISTS loss_factors JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS diagnostic_context JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_predictions_accuracy_event_id
    ON public.predictions_accuracy(event_id);

CREATE INDEX IF NOT EXISTS idx_predictions_accuracy_fixture_date
    ON public.predictions_accuracy(fixture_date);

CREATE INDEX IF NOT EXISTS idx_predictions_accuracy_resolution_status
    ON public.predictions_accuracy(resolution_status);

CREATE INDEX IF NOT EXISTS idx_predictions_accuracy_publish_run_id
    ON public.predictions_accuracy(publish_run_id);
