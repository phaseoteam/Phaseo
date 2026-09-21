alter table public.users
  add column if not exists display_density text not null default 'comfortable',
  add column if not exists display_code_language text not null default 'typescript',
  add column if not exists display_landing_page text not null default 'home';

alter table public.users
  drop constraint if exists users_display_density_check,
  drop constraint if exists users_display_code_language_check,
  drop constraint if exists users_display_landing_page_check;

alter table public.users
  add constraint users_display_density_check
    check (display_density in ('comfortable', 'compact')),
  add constraint users_display_code_language_check
    check (display_code_language in ('typescript', 'python', 'curl')),
  add constraint users_display_landing_page_check
    check (display_landing_page in ('home', 'models', 'chat', 'monitor'));

comment on column public.users.display_density is 'Preferred interface spacing density.';
comment on column public.users.display_code_language is 'Preferred language for code samples.';
comment on column public.users.display_landing_page is 'Preferred destination after an ordinary sign-in.';
