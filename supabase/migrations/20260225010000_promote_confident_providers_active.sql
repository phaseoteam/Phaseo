-- Promote providers with established production readiness to Active.
-- Keeps default status behavior unchanged for new/unknown providers.
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
    where api_provider_id in (
      'openai',
      'anthropic',
      'google-ai-studio',
      'x-ai',
      'deepseek',
      'minimax',
      'moonshot-ai',
      'moonshot-ai-turbo',
      'z-ai',
      'alibaba',
      'xiaomi'
    );
  end if;
end $$;
