-- Per-evaluation feature log (durable cloud mirror of logs/calibration.jsonl).
-- One row per settled evaluation (bets AND skips); full record + all regime
-- features live in the JSONB `record` so new features need no schema change.
CREATE TABLE IF NOT EXISTS public.pm_evaluations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id TEXT NOT NULL,
    ticker TEXT NOT NULL,
    settled_at TIMESTAMPTZ NOT NULL,
    actual_yes INTEGER,
    would_have_won BOOLEAN,
    was_bet BOOLEAN,
    direction TEXT,
    realized_vol DOUBLE PRECISION,
    vr DOUBLE PRECISION,
    edge_cents INTEGER,
    record JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(bot_id, ticker, settled_at)
);
CREATE INDEX IF NOT EXISTS idx_pm_evaluations_bot_settled ON public.pm_evaluations(bot_id, settled_at);

-- Match the locked-down posture of sibling pm_ tables: writers use service_role
-- (bot SUPABASE_SERVICE_KEY). Deny the public anon/authenticated roles so this
-- table is not exposed via the Supabase client anon key.
REVOKE ALL ON public.pm_evaluations FROM anon, authenticated;
GRANT ALL ON public.pm_evaluations TO service_role;;
