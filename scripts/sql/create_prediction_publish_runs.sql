CREATE TABLE IF NOT EXISTS public.prediction_publish_runs (
    id BIGSERIAL PRIMARY KEY,
    trigger_source TEXT NOT NULL DEFAULT 'manual',
    requested_sports TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
    run_scope TEXT NOT NULL DEFAULT 'all',
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
    notes TEXT,
    error_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prediction_publish_runs_status
    ON public.prediction_publish_runs(status);

CREATE INDEX IF NOT EXISTS idx_prediction_publish_runs_completed_at
    ON public.prediction_publish_runs(completed_at DESC NULLS LAST);

ALTER TABLE public.predictions_final
    ADD COLUMN IF NOT EXISTS publish_run_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'predictions_final_publish_run_id_fkey'
    ) THEN
        ALTER TABLE public.predictions_final
            ADD CONSTRAINT predictions_final_publish_run_id_fkey
            FOREIGN KEY (publish_run_id)
            REFERENCES public.prediction_publish_runs(id)
            ON DELETE CASCADE;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_predictions_final_publish_run_id
    ON public.predictions_final(publish_run_id);

DO $$
DECLARE
    legacy_run_id BIGINT;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.predictions_final
        WHERE publish_run_id IS NULL
    ) THEN
        SELECT id
        INTO legacy_run_id
        FROM public.prediction_publish_runs
        WHERE trigger_source = 'legacy_backfill'
          AND status = 'completed'
        ORDER BY id DESC
        LIMIT 1;

        IF legacy_run_id IS NULL THEN
            INSERT INTO public.prediction_publish_runs (
                trigger_source,
                requested_sports,
                run_scope,
                status,
                notes,
                metadata,
                started_at,
                completed_at
            )
            VALUES (
                'legacy_backfill',
                ARRAY['legacy'],
                'legacy',
                'completed',
                'Backfilled existing predictions_final rows before publish-run tracking.',
                '{"backfilled": true}'::jsonb,
                COALESCE((SELECT MIN(created_at) FROM public.predictions_final), NOW()),
                COALESCE((SELECT MAX(created_at) FROM public.predictions_final), NOW())
            )
            RETURNING id INTO legacy_run_id;
        END IF;

        UPDATE public.predictions_final
        SET publish_run_id = legacy_run_id
        WHERE publish_run_id IS NULL;
    END IF;
END
$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'predictions_accuracy'
    ) THEN
        ALTER TABLE public.predictions_accuracy
            ADD COLUMN IF NOT EXISTS publish_run_id BIGINT;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'predictions_accuracy_publish_run_id_fkey'
        ) THEN
            ALTER TABLE public.predictions_accuracy
                ADD CONSTRAINT predictions_accuracy_publish_run_id_fkey
                FOREIGN KEY (publish_run_id)
                REFERENCES public.prediction_publish_runs(id)
                ON DELETE SET NULL;
        END IF;

        CREATE INDEX IF NOT EXISTS idx_predictions_accuracy_publish_run_id
            ON public.predictions_accuracy(publish_run_id);

        UPDATE public.predictions_accuracy pa
        SET publish_run_id = pf.publish_run_id
        FROM public.predictions_final pf
        WHERE pa.prediction_final_id = pf.id
          AND pa.publish_run_id IS NULL;
    END IF;
END
$$;
