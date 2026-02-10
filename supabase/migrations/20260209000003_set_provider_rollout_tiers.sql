-- Set provider rollout tiers for gateway/provider readiness views.
-- Rule: core providers -> Active, confident newer providers -> Beta, all remaining -> Alpha.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'data_api_providers'
      and column_name = 'status'
  ) then
    insert into public.data_api_providers (
      api_provider_id,
      api_provider_name,
      description,
      link,
      country_code,
      status
    )
    values (
      'elevenlabs',
      'ElevenLabs',
      null,
      'https://elevenlabs.io/docs/api-reference/introduction',
      'US',
      'Alpha'
    )
    on conflict (api_provider_id) do nothing;

    update public.data_api_providers
    set status = 'Active'
    where api_provider_id in (
      'openai',
      'anthropic',
      'x-ai',
      'google-ai-studio',
      'deepseek',
      'minimax',
      'qwen',
      'z-ai',
      'moonshot-ai',
      'moonshot-ai-turbo',
      'alibaba',
      'xiaomi'
    );

    update public.data_api_providers
    set status = 'Beta'
    where api_provider_id in (
      'amazon-bedrock',
      'google-vertex',
      'azure',
      'groq',
      'cerebras',
      'mistral',
      'together',
      'fireworks',
      'deepinfra',
      'cloudflare',
      'perplexity',
      'ai21',
      'cohere',
      'sambanova',
      'friendli',
      'chutes',
      'minimax-lightning'
    );

    update public.data_api_providers
    set status = 'Alpha'
    where coalesce(status, '') not in ('Active', 'Beta');
  end if;
end $$;
