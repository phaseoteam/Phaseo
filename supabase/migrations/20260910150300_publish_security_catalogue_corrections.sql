-- Publish security-sensitive catalogue corrections to the canonical database.
-- phaseo:allow-destructive-migration reason: Disable routes with unresolved billing or regional-policy exposure and remap incorrectly shared billing identities.

-- BFL image submissions can outlive synchronous polling. Keep their routes
-- unavailable until durable post-submit settlement is deployed.
update public.v2_model_provider_routes
set status = 'disabled',
    routing_enabled = false,
    updated_at = now()
where provider_model_id = any (array[
  'black-forest-labs:black-forest-labs/flux-1.1-pro',
  'black-forest-labs:black-forest-labs/flux-1.1-pro-ultra',
  'black-forest-labs:black-forest-labs/flux-1-kontext-max',
  'black-forest-labs:black-forest-labs/flux-1-kontext-pro',
  'black-forest-labs:black-forest-labs/flux-2-flex',
  'black-forest-labs:black-forest-labs/flux-2-klein-4b',
  'black-forest-labs:black-forest-labs/flux-2-klein-9b',
  'black-forest-labs:black-forest-labs/flux-2-max',
  'black-forest-labs:black-forest-labs/flux-2-pro'
]);

update public.v2_route_capabilities
set status = 'disabled', updated_at = now()
where provider_model_id = any (array[
  'black-forest-labs:black-forest-labs/flux-1.1-pro',
  'black-forest-labs:black-forest-labs/flux-1.1-pro-ultra',
  'black-forest-labs:black-forest-labs/flux-1-kontext-max',
  'black-forest-labs:black-forest-labs/flux-1-kontext-pro',
  'black-forest-labs:black-forest-labs/flux-2-flex',
  'black-forest-labs:black-forest-labs/flux-2-klein-4b',
  'black-forest-labs:black-forest-labs/flux-2-klein-9b',
  'black-forest-labs:black-forest-labs/flux-2-max',
  'black-forest-labs:black-forest-labs/flux-2-pro'
]);

-- Contributor traffic is not geographically constrained by Meta, so do not
-- expose these routes through a gateway that promises regional enforcement.
update public.v2_model_provider_routes
set status = 'disabled',
    routing_enabled = false,
    updated_at = now()
where provider_model_id in (
  'meta:meta/muse-spark-1.2-contributor',
  'meta:meta/muse-spark-1.3-contributor'
);

update public.v2_route_capabilities
set status = 'disabled', updated_at = now()
where provider_model_id in (
  'meta:meta/muse-spark-1.2-contributor',
  'meta:meta/muse-spark-1.3-contributor'
);

-- MiniMax exposes these as independently priced products. Give each product
-- its own canonical identity before remapping the provider routes.
insert into public.v2_models (
  model_slug, lab_slug, name, description, status, hidden,
  input_modalities, output_modalities, announced_at, released_at, metadata
)
values
  (
    'minimax/minimax-m2.5-highspeed', 'minimax', 'MiniMax M2.5 Highspeed',
    'The high-speed MiniMax M2.5 API variant, with independently metered provider pricing.',
    'active', false, array['text'], array['text'],
    '2026-02-12T00:00:00Z'::timestamptz, '2026-02-12T00:00:00Z'::timestamptz,
    jsonb_build_object('previous_model_slug', 'minimax/minimax-m2.5')
  ),
  (
    'minimax/speech-2.8-hd', 'minimax', 'Speech 2.8 HD',
    'The high-definition MiniMax Speech 2.8 API variant, with independently metered provider pricing.',
    'active', false, array['text'], array['audio_tts'],
    '2026-01-23T00:00:00Z'::timestamptz, '2026-01-23T00:00:00Z'::timestamptz,
    jsonb_build_object('previous_model_slug', 'minimax/speech-2.6')
  ),
  (
    'minimax/speech-2.8-turbo', 'minimax', 'Speech 2.8 Turbo',
    'The low-latency MiniMax Speech 2.8 API variant, with independently metered provider pricing.',
    'active', false, array['text'], array['audio_tts'],
    '2026-01-23T00:00:00Z'::timestamptz, '2026-01-23T00:00:00Z'::timestamptz,
    jsonb_build_object('previous_model_slug', 'minimax/speech-2.6')
  )
on conflict (model_slug) do update set
  name = excluded.name,
  description = excluded.description,
  status = excluded.status,
  hidden = excluded.hidden,
  input_modalities = excluded.input_modalities,
  output_modalities = excluded.output_modalities,
  announced_at = excluded.announced_at,
  released_at = excluded.released_at,
  metadata = public.v2_models.metadata || excluded.metadata,
  updated_at = now();

update public.v2_model_provider_routes
set model_slug = 'minimax/minimax-m2.5-highspeed', updated_at = now()
where provider_model_id = any (array[
  'minimax:minimax/minimax-m2.5-highspeed',
  'novita:minimax/minimax-m2.5-highspeed',
  'fastrouter:minimax/minimax-m2.5-highspeed',
  'merge-gateway:minimax/minimax-m2.5-highspeed',
  'orcarouter:minimax/minimax-m2.5-highspeed',
  'qiniu-ai:minimax/minimax-m2.5-highspeed',
  'requesty:minimaxi/minimax-m2.5-highspeed',
  'vercel:minimax/minimax-m2.5-highspeed'
]);

update public.v2_model_provider_routes
set model_slug = 'minimax/speech-2.8-hd', updated_at = now()
where provider_model_id = 'minimax:minimax/speech-2.8-hd';

update public.v2_model_provider_routes
set model_slug = 'minimax/speech-2.8-turbo', updated_at = now()
where provider_model_id = 'minimax:minimax/speech-2.8-turbo';
