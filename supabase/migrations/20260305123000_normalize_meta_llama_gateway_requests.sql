-- Normalize legacy Meta model IDs in gateway request logs.
-- Example: meta-llama/Llama-3.1-8B-Instruct -> meta/Llama-3.1-8B-Instruct
-- Safety: only touches rows matching meta-llama/{non-empty-id}; safe to re-run.

update public.gateway_requests
set model_id = regexp_replace(model_id, '^meta-llama/', 'meta/', 'i')
where model_id ~* '^meta-llama/.+$';
