-- Promote Mistral to Active rollout tier after stabilization updates.
update public.data_api_providers
set status = 'Active'
where api_provider_id = 'mistral';
