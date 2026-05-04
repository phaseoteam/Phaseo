alter table public.gateway_requests
  add column if not exists provider_attempts jsonb not null default '[]'::jsonb;

comment on column public.gateway_requests.provider_attempts is
  'Gateway-captured provider routing attempts for this request, including failures, statuses, durations, and upstream error summaries.';
