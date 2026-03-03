-- Set Alibaba Cloud rollout tier to Beta.
update public.data_api_providers
set status = 'Beta'
where lower(trim(api_provider_id)) = 'alibaba-cloud';

-- Remove Qwen as a standalone provider entry; Qwen models route through Alibaba Cloud.
delete from public.data_api_providers
where lower(trim(api_provider_id)) = 'qwen';
