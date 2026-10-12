-- OpenAI lifecycle status for 10 rows, checked 2026-10-12 against https://developers.openai.com/api/docs/deprecations.
--   retired (shutdown date already passed): gpt-5-chat-latest, gpt-5.1-chat-latest (2026-07-23),
--     gpt-3.5-turbo-1106 / gpt-3.5-turbo-2023-11-06 (2026-09-28), gpt-3.5-turbo-0613 (2024-09-13).
--   deprecated (announced, still served until the shutdown date): gpt-4o-mini-tts-2025-12-15
--     (2027-01-06), gpt-4-turbo-2024-04-09 and gpt-4.1-nano-2025-04-14 (2026-10-23),
--     gpt-5.1-2025-11-13 and gpt-5.4-nano-2026-03-17 (2027-04-01).
-- status and catalogue_status (what the public API shows; it takes precedence over status) change together.
-- All of these rows already carry deprecated_at <= now, so customers with deprecation alerts enabled
-- are already being notified; setting status does not create a new notification. Gateway routing is
-- unchanged: it is driven by retired_at, which this migration does not move (except codex-mini below).
-- Not changed, on purpose: gpt-4o-mini-tts-2025-03-20 is retired in the catalogue but OpenAI serves it
-- until 2027-01-06 (retired_at already says so). Marking it deprecated would make the gateway route it
-- again, so it stays retired until the owner decides.

-- Each update is guarded on the values observed during the 2026-10-12 audit, so
-- a newer admin edit is never overwritten. Row-level history is recorded by the
-- catalogue_row_history trigger on public.v2_models.
with fixes (model_slug, old_status, new_status, old_catalogue_status, new_catalogue_status) as (
values
  ('openai/gpt-5-chat-latest'::text, 'active'::text, 'retired'::text, 'available'::text, 'retired'::text),
  ('openai/gpt-5.1-chat-latest'::text, 'active'::text, 'retired'::text, 'available'::text, 'retired'::text),
  ('openai/gpt-3.5-turbo-1106'::text, 'deprecated'::text, 'retired'::text, 'deprecated'::text, 'retired'::text),
  ('openai/gpt-3.5-turbo-2023-11-06'::text, 'deprecated'::text, 'retired'::text, 'deprecated'::text, 'retired'::text),
  ('openai/gpt-3.5-turbo-0613'::text, 'deprecated'::text, 'retired'::text, 'deprecated'::text, 'retired'::text),
  ('openai/gpt-4o-mini-tts-2025-12-15'::text, 'active'::text, 'deprecated'::text, 'available'::text, 'deprecated'::text),
  ('openai/gpt-4-turbo-2024-04-09'::text, 'active'::text, 'deprecated'::text, 'available'::text, 'deprecated'::text),
  ('openai/gpt-4.1-nano-2025-04-14'::text, 'active'::text, 'deprecated'::text, 'available'::text, 'deprecated'::text),
  ('openai/gpt-5.1-2025-11-13'::text, 'active'::text, 'deprecated'::text, 'available'::text, 'deprecated'::text),
  ('openai/gpt-5.4-nano-2026-03-17'::text, 'active'::text, 'deprecated'::text, 'available'::text, 'deprecated'::text)
), applied as (
  update public.v2_models m
  set status = f.new_status,
      catalogue_status = f.new_catalogue_status,
      updated_at = now()
  from fixes f
  where m.model_slug = f.model_slug
    and m.status is not distinct from f.old_status
    and m.catalogue_status is not distinct from f.old_catalogue_status
  returning m.model_slug
)
select count(*) as updated_rows, 10 as expected_rows from applied;

-- OpenAI codex-mini: codex-mini-latest shut down 2026-02-12 (2025-11-17 deprecation entry).
with fixes (model_slug, old_retired_at, new_retired_at) as (
values
  ('openai/codex-mini'::text, '2026-01-16T00:00:00Z'::timestamptz, '2026-02-12T00:00:00Z'::timestamptz)
), applied as (
  update public.v2_models m
  set retired_at = f.new_retired_at,
      updated_at = now()
  from fixes f
  where m.model_slug = f.model_slug
    and m.retired_at is not distinct from f.old_retired_at
  returning m.model_slug
)
select count(*) as updated_rows, 1 as expected_rows from applied;

-- OpenAI replacement models, from the replacement named on OpenAI's deprecations page (and older notices for 2023-2025 retirements).
with fixes (model_slug, old_replacement_model_slug, new_replacement_model_slug) as (
values
  ('openai/gpt-5.4-nano'::text, null::text, 'openai/gpt-6-luna'::text),
  ('openai/gpt-5.4-nano-2026-03-17'::text, null::text, 'openai/gpt-6-luna'::text),
  ('openai/gpt-5.3-codex'::text, null::text, 'openai/gpt-6-sol'::text),
  ('openai/gpt-5.1'::text, null::text, 'openai/gpt-6-sol'::text),
  ('openai/gpt-5.1-2025-11-13'::text, null::text, 'openai/gpt-6-sol'::text),
  ('openai/tts-1'::text, null::text, 'openai/gpt-realtime-2.1-mini'::text),
  ('openai/tts-1-hd'::text, null::text, 'openai/gpt-realtime-2.1-mini'::text),
  ('openai/gpt-4o-mini-tts-2025-03-20'::text, null::text, 'openai/gpt-realtime-2.1-mini'::text),
  ('openai/gpt-4o-mini-tts-2025-12-15'::text, null::text, 'openai/gpt-realtime-2.1-mini'::text),
  ('openai/gpt-4o-mini-tts'::text, null::text, 'openai/gpt-realtime-2.1-mini'::text),
  ('openai/gpt-5.3-chat'::text, null::text, 'openai/gpt-5.6-sol'::text),
  ('openai/gpt-5.2-chat'::text, null::text, 'openai/gpt-5.6-sol'::text),
  ('openai/gpt-3.5-turbo'::text, null::text, 'openai/gpt-5.6-terra'::text),
  ('openai/gpt-3.5-turbo-2024-01-25'::text, null::text, 'openai/gpt-5.6-terra'::text),
  ('openai/gpt-4-turbo-2024-04-09'::text, null::text, 'openai/gpt-5.6-sol'::text),
  ('openai/gpt-4.1-nano-2025-04-14'::text, null::text, 'openai/gpt-5.6-luna'::text),
  ('openai/computer-use-preview'::text, null::text, 'openai/gpt-5.6-terra'::text),
  ('openai/gpt-4o-mini-search-preview'::text, null::text, 'openai/gpt-5.6-terra'::text),
  ('openai/gpt-4o-search-preview'::text, null::text, 'openai/gpt-5.6-terra'::text),
  ('openai/gpt-5.1-codex-mini'::text, null::text, 'openai/gpt-5.6-terra'::text),
  ('openai/gpt-5-chat-latest'::text, null::text, 'openai/gpt-5.6-sol'::text),
  ('openai/gpt-5-codex'::text, null::text, 'openai/gpt-5.6-sol'::text),
  ('openai/gpt-5.1-chat-latest'::text, null::text, 'openai/gpt-5.6-sol'::text),
  ('openai/gpt-5.1-codex'::text, null::text, 'openai/gpt-5.6-sol'::text),
  ('openai/gpt-5.1-codex-max'::text, null::text, 'openai/gpt-5.6-sol'::text),
  ('openai/gpt-5.2-codex'::text, null::text, 'openai/gpt-5.6-sol'::text),
  ('openai/o3-deep-research'::text, null::text, 'openai/gpt-5.6-sol'::text),
  ('openai/o4-mini-deep-research'::text, null::text, 'openai/gpt-5.6-sol'::text),
  ('openai/gpt-5-chat'::text, null::text, 'openai/gpt-5.6-sol'::text),
  ('openai/gpt-5.1-chat'::text, null::text, 'openai/gpt-5.6-sol'::text),
  ('openai/gpt-audio-mini-2025-10-06'::text, null::text, 'openai/gpt-audio-1.5'::text),
  ('openai/gpt-realtime-mini-2025-10-06'::text, null::text, 'openai/gpt-realtime-2.1-mini'::text),
  ('openai/codex-mini'::text, null::text, 'openai/gpt-5-codex-mini'::text),
  ('openai/gpt-3.5-turbo-instruct'::text, null::text, 'openai/gpt-5.6-terra'::text),
  ('openai/babbage-002'::text, null::text, 'openai/gpt-5.6-terra'::text),
  ('openai/davinci-002'::text, null::text, 'openai/gpt-5.6-terra'::text),
  ('openai/gpt-3.5-turbo-2023-11-06'::text, null::text, 'openai/gpt-5.6-terra'::text),
  ('openai/gpt-4o-realtime-preview'::text, null::text, 'openai/gpt-realtime-1.5'::text),
  ('openai/gpt-4o-realtime-preview-2024-12-17'::text, null::text, 'openai/gpt-realtime-1.5'::text),
  ('openai/gpt-4o-realtime-preview-2024-10-01'::text, null::text, 'openai/gpt-realtime-1.5'::text),
  ('openai/gpt-4o-audio-2024-10-01'::text, null::text, 'openai/gpt-audio-1.5'::text),
  ('openai/text-moderation-007'::text, null::text, 'openai/omni-moderation'::text),
  ('openai/o1-preview'::text, null::text, 'openai/o3'::text),
  ('openai/o1-mini'::text, null::text, 'openai/o4-mini'::text),
  ('openai/gpt-4.5'::text, null::text, 'openai/gpt-4.1'::text),
  ('openai/gpt-4-32k'::text, null::text, 'openai/gpt-4o'::text),
  ('openai/gpt-4-32k-0613'::text, null::text, 'openai/gpt-4o'::text),
  ('openai/gpt-4-32k-0314'::text, null::text, 'openai/gpt-4o'::text),
  ('openai/gpt-3.5-turbo-0613'::text, null::text, 'openai/gpt-3.5-turbo'::text),
  ('openai/gpt-3.5-turbo-16k-0613'::text, null::text, 'openai/gpt-3.5-turbo'::text),
  ('openai/text-ada-001'::text, null::text, 'openai/gpt-3.5-turbo-instruct'::text),
  ('openai/text-babbage-001'::text, null::text, 'openai/gpt-3.5-turbo-instruct'::text),
  ('openai/text-curie-001'::text, null::text, 'openai/gpt-3.5-turbo-instruct'::text),
  ('openai/text-davinci-001'::text, null::text, 'openai/gpt-3.5-turbo-instruct'::text),
  ('openai/text-davinci-002'::text, null::text, 'openai/gpt-3.5-turbo-instruct'::text),
  ('openai/text-davinci-003'::text, null::text, 'openai/gpt-3.5-turbo-instruct'::text),
  ('openai/ada'::text, null::text, 'openai/babbage-002'::text),
  ('openai/babbage'::text, null::text, 'openai/babbage-002'::text),
  ('openai/curie'::text, null::text, 'openai/davinci-002'::text),
  ('openai/davinci'::text, null::text, 'openai/davinci-002'::text),
  ('openai/text-davinci-edit-001'::text, null::text, 'openai/gpt-4o'::text),
  ('openai/code-davinci-edit-001'::text, null::text, 'openai/gpt-4o'::text),
  ('openai/code-cushman-001'::text, null::text, 'openai/gpt-4o'::text),
  ('openai/code-cushman-002'::text, null::text, 'openai/gpt-4o'::text),
  ('openai/code-davinci-001'::text, null::text, 'openai/gpt-4o'::text)
), applied as (
  update public.v2_models m
  set replacement_model_slug = f.new_replacement_model_slug,
      updated_at = now()
  from fixes f
  where m.model_slug = f.model_slug
    and m.replacement_model_slug is not distinct from f.old_replacement_model_slug
  returning m.model_slug
)
select count(*) as updated_rows, 65 as expected_rows from applied;
