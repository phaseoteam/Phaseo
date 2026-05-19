alter table public.users
	add column if not exists public_profile_enabled boolean not null default false;

alter table public.users
	add column if not exists public_profile_slug text;

create unique index if not exists users_public_profile_slug_key
	on public.users (public_profile_slug)
	where public_profile_slug is not null;
