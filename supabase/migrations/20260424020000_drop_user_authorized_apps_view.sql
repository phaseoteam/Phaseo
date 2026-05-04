-- Remove legacy authorized-apps projection view.
-- App code now reads oauth_authorizations + oauth_app_metadata directly.

drop view if exists public.user_authorized_apps;
drop view if exists public.user_authorised_apps;
