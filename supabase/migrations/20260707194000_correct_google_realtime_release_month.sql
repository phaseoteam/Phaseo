-- Correct Gemini 3.1 Flash Live Preview release metadata.
-- Google's model card exposes month-level recency: "Latest update March 2026".

update public.data_models
set announcement_date = '2026-03-01T00:00:00Z',
    release_date = '2026-03-01T00:00:00Z',
    updated_at = now()
where model_id = 'google/gemini-3.1-flash-live-preview';
insert into public.data_model_details (model_id, detail_name, detail_value)
select
  'google/gemini-3.1-flash-live-preview',
  'release_note',
  'Google''s model card exposes month-level recency only: Latest update March 2026. AI Stats stores 2026-03-01 for sortable catalog display.'
where exists (
  select 1
  from public.data_models
  where model_id = 'google/gemini-3.1-flash-live-preview'
)
and not exists (
  select 1
  from public.data_model_details
  where model_id = 'google/gemini-3.1-flash-live-preview'
    and detail_name = 'release_note'
    and detail_value = 'Google''s model card exposes month-level recency only: Latest update March 2026. AI Stats stores 2026-03-01 for sortable catalog display.'
);
update public.data_api_provider_models
set effective_from = '2026-03-01T00:00:00Z',
    updated_at = now()
where provider_api_model_id = 'google-ai-studio:google/gemini-3.1-flash-live-preview';
update public.data_api_pricing_rules
set effective_from = '2026-03-01T00:00:00Z',
    updated_at = now()
where model_key = 'google-ai-studio:google/gemini-3.1-flash-live-preview:audio.realtime'
  and capability_id = 'audio.realtime';

