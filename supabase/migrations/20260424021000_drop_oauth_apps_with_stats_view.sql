-- Remove legacy OAuth app stats projection view.
-- App code now derives stats directly from oauth_app_metadata + related tables.

drop view if exists public.oauth_apps_with_stats;
