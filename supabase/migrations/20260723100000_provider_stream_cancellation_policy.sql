-- Store provider cancellation and billing semantics separately. Cancellation
-- support alone is insufficient to safely abort when terminal usage is lost.

alter table public.data_api_providers
  add column if not exists stream_cancellation_support text not null default 'unknown',
  add column if not exists stream_cancellation_stops_provider_billing boolean,
  add column if not exists stream_cancellation_usage_recovery text not null default 'unknown',
  add column if not exists stream_cancellation_evidence_kind text not null default 'none',
  add column if not exists stream_cancellation_source_url text,
  add column if not exists stream_cancellation_verified_at timestamptz;

alter table public.v2_providers
  add column if not exists stream_cancellation_support text not null default 'unknown',
  add column if not exists stream_cancellation_stops_provider_billing boolean,
  add column if not exists stream_cancellation_usage_recovery text not null default 'unknown',
  add column if not exists stream_cancellation_evidence_kind text not null default 'none',
  add column if not exists stream_cancellation_source_url text,
  add column if not exists stream_cancellation_verified_at timestamptz;

do $$
declare
  v_table regclass;
begin
  foreach v_table in array array['public.data_api_providers'::regclass, 'public.v2_providers'::regclass]
  loop
    execute format('alter table %s drop constraint if exists %I', v_table, replace(v_table::text, '.', '_') || '_stream_cancel_support_check');
    execute format(
      'alter table %s add constraint %I check (stream_cancellation_support in (''supported'', ''unsupported'', ''unknown''))',
      v_table,
      replace(v_table::text, '.', '_') || '_stream_cancel_support_check'
    );
    execute format('alter table %s drop constraint if exists %I', v_table, replace(v_table::text, '.', '_') || '_stream_cancel_usage_check');
    execute format(
      'alter table %s add constraint %I check (stream_cancellation_usage_recovery in (''authoritative'', ''unknown''))',
      v_table,
      replace(v_table::text, '.', '_') || '_stream_cancel_usage_check'
    );
    execute format('alter table %s drop constraint if exists %I', v_table, replace(v_table::text, '.', '_') || '_stream_cancel_evidence_check');
    execute format(
      'alter table %s add constraint %I check (stream_cancellation_evidence_kind in (''provider'', ''aggregator'', ''none''))',
      v_table,
      replace(v_table::text, '.', '_') || '_stream_cancel_evidence_check'
    );
    execute format('alter table %s drop constraint if exists %I', v_table, replace(v_table::text, '.', '_') || '_stream_cancel_billing_check');
    execute format(
      'alter table %s add constraint %I check (stream_cancellation_stops_provider_billing is distinct from true or stream_cancellation_support = ''supported'')',
      v_table,
      replace(v_table::text, '.', '_') || '_stream_cancel_billing_check'
    );
  end loop;
end $$;

create temporary table provider_stream_cancel_evidence (
  provider_slug text primary key,
  support text not null,
  stops_billing boolean
) on commit drop;

insert into provider_stream_cancel_evidence(provider_slug, support, stops_billing) values
  ('anthropic', 'supported', true), ('anthropic-us', 'supported', true),
  ('avian', 'supported', true), ('azure', 'supported', true),
  ('chutes', 'supported', true), ('cloudflare', 'supported', true),
  ('cohere', 'supported', true), ('deepinfra', 'supported', true),
  ('deepseek', 'supported', true), ('fireworks', 'supported', true),
  ('friendli', 'supported', true), ('hyperbolic', 'supported', true),
  ('infermatic', 'supported', true), ('liquid-ai', 'supported', true),
  ('mancer', 'supported', true), ('novita', 'supported', true),
  ('openai', 'supported', true), ('openai-eu', 'supported', true),
  ('together', 'supported', true),
  ('ai21', 'unsupported', null), ('aion-labs', 'unsupported', null),
  ('alibaba-cloud', 'unsupported', null), ('amazon-bedrock', 'unsupported', null),
  ('anthropic-aws', 'unsupported', null), ('anthropic-aws-us', 'unsupported', null),
  ('featherless', 'unsupported', null), ('google-ai-studio', 'unsupported', null),
  ('google-vertex', 'unsupported', null), ('google-vertex-eu', 'unsupported', null),
  ('groq', 'unsupported', null), ('inference-net', 'unsupported', null),
  ('inflection', 'unsupported', null), ('minimax', 'unsupported', null),
  ('minimax-lightning', 'unsupported', null), ('mistral', 'unsupported', null),
  ('nebius-token-factory', 'unsupported', null), ('nebius-token-factory-fast', 'unsupported', null),
  ('perplexity', 'unsupported', null), ('sambanova', 'unsupported', null);

update public.data_api_providers provider
set stream_cancellation_support = evidence.support,
    stream_cancellation_stops_provider_billing = evidence.stops_billing,
    stream_cancellation_usage_recovery = 'unknown',
    stream_cancellation_evidence_kind = 'aggregator',
    stream_cancellation_source_url = 'https://openrouter.ai/docs/api/reference/streaming',
    stream_cancellation_verified_at = '2026-07-23T00:00:00Z'::timestamptz
from provider_stream_cancel_evidence evidence
where evidence.provider_slug = provider.api_provider_id;

update public.v2_providers provider
set stream_cancellation_support = evidence.support,
    stream_cancellation_stops_provider_billing = evidence.stops_billing,
    stream_cancellation_usage_recovery = 'unknown',
    stream_cancellation_evidence_kind = 'aggregator',
    stream_cancellation_source_url = 'https://openrouter.ai/docs/api/reference/streaming',
    stream_cancellation_verified_at = '2026-07-23T00:00:00Z'::timestamptz,
    updated_at = now()
from provider_stream_cancel_evidence evidence
where evidence.provider_slug = provider.provider_slug;

comment on column public.v2_providers.stream_cancellation_support is
  'Whether the provider is evidenced to accept stream cancellation. Unknown fails closed.';
comment on column public.v2_providers.stream_cancellation_stops_provider_billing is
  'Whether provider processing and provider billing are evidenced to stop after cancellation.';
comment on column public.v2_providers.stream_cancellation_usage_recovery is
  'Whether Phaseo can recover authoritative usage after cancellation. Required before cancel_upstream is enabled.';
