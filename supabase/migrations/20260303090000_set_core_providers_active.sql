-- Ensure core gateway providers remain active for routing/enrichment.
-- This is an explicit corrective migration for existing rows.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'data_api_providers'
      and column_name = 'status'
  ) then
    update public.data_api_providers
    set status = 'Active'
    where lower(trim(api_provider_id)) in (
      'anthropic',
      'cerebras',
      'deepseek',
      'google-ai-studio',
      'google-vertex',
      'minimax',
      'mistral',
      'moonshotai',
      'moonshot-ai',
      'novita',
      'openai',
      'x-ai',
      'xai',
      'xiaomi',
      'z-ai',
      'zai'
    );
  end if;
end $$;
