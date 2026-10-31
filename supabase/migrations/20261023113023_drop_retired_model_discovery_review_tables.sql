-- Restored from Phaseo Prod migration records; version 20261023113023, read back 2026-10-23.
-- phaseo:allow-production-history-backfill reason: Restore the already-applied discovery review table retirement so repository history matches production without changing remote records.
-- phaseo:allow-destructive-migration reason: These discovery review tables and decision RPC were already removed in production by recorded migration 20261023113023; restore that exact history for matching and disposable replay.
drop function if exists public.record_model_discovery_review_decision(uuid,text,text,uuid,timestamp with time zone);
drop table public.model_discovery_review_events;
drop table public.model_discovery_review_items;
-- Keep the retired ingestion compatibility RPC so older deployed workers can
-- continue delivering Discord notifications without a missing-function error.
