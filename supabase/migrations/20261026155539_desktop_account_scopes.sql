-- The desktop app may ask for the same account access as the Phaseo CLI, so someone signed in to it can see their
-- credits and usage and manage keys, presets, settings and workspaces there. The consent screen still lists every
-- scope and lets each optional one be declined; gateway:access stays required for the app's model calls.
update public.oauth_clients
set allowed_scopes = array(
  select distinct scope
  from unnest(coalesce(allowed_scopes, array[]::text[]) || array[
    'openid', 'profile', 'email', 'gateway:access', 'me:read',
    'models:read', 'providers:read', 'pricing:read', 'credits:read', 'activity:read', 'analytics:read', 'generations:read',
    'workspaces:read', 'workspaces:write', 'workspaces:delete',
    'keys:read', 'keys:write', 'keys:delete',
    'presets:read', 'presets:write', 'presets:delete',
    'settings:read', 'settings:write',
    'guardrails:read', 'guardrails:write', 'guardrails:delete',
    'budgets:read', 'budgets:write', 'budgets:delete',
    'rate_limits:read', 'rate_limits:write', 'rate_limits:delete',
    'classifiers:read', 'classifiers:write', 'classifiers:delete',
    'management_keys:read', 'management_keys:write', 'management_keys:delete',
    'oauth_clients:read', 'oauth_clients:write', 'oauth_clients:delete'
  ]::text[]) as scope
  order by scope
)
where id = 'phaseo_desktop';
