alter table public.users
  add column if not exists display_locale text not null default 'system',
  add column if not exists display_date_style text not null default 'medium',
  add column if not exists display_time_zone text not null default 'system',
  add column if not exists display_hour_cycle text not null default 'system',
  add column if not exists display_relative_time text not null default 'contextual',
  add column if not exists display_number_notation text not null default 'standard',
  add column if not exists display_light_palette text not null default 'phaseo',
  add column if not exists display_dark_palette text not null default 'phaseo',
  add column if not exists display_light_accent text not null default '#0069a8',
  add column if not exists display_dark_accent text not null default '#0078b8';

alter table public.users
  add constraint users_display_locale_check
    check (display_locale in ('system', 'en-GB', 'en-US')),
  add constraint users_display_date_style_check
    check (display_date_style in ('short', 'medium', 'long', 'iso')),
  add constraint users_display_time_zone_check
    check (
      char_length(display_time_zone) between 1 and 100
      and (
        display_time_zone in ('system', 'UTC')
        or display_time_zone ~ '^[A-Za-z0-9._+-]+(/[A-Za-z0-9._+-]+)+$'
      )
    ),
  add constraint users_display_hour_cycle_check
    check (display_hour_cycle in ('system', '12h', '24h')),
  add constraint users_display_relative_time_check
    check (display_relative_time in ('contextual', 'relative', 'absolute')),
  add constraint users_display_number_notation_check
    check (display_number_notation in ('standard', 'compact')),
  add constraint users_display_light_palette_check
    check (display_light_palette in ('phaseo', 'paper', 'warm')),
  add constraint users_display_dark_palette_check
    check (display_dark_palette in ('phaseo', 'slate', 'midnight')),
  add constraint users_display_light_accent_check
    check (display_light_accent ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint users_display_dark_accent_check
    check (display_dark_accent ~ '^#[0-9A-Fa-f]{6}$');

comment on column public.users.display_locale is 'Preferred locale for display formatting; system follows the browser.';
comment on column public.users.display_date_style is 'Preferred date presentation style.';
comment on column public.users.display_time_zone is 'Preferred IANA time zone; system follows the browser.';
comment on column public.users.display_hour_cycle is 'Preferred 12-hour, 24-hour, or system clock.';
comment on column public.users.display_relative_time is 'Preferred relative versus absolute timestamp presentation.';
comment on column public.users.display_number_notation is 'Preferred standard or compact number notation.';
comment on column public.users.display_light_palette is 'Preferred neutral surface palette for light mode.';
comment on column public.users.display_dark_palette is 'Preferred neutral surface palette for dark mode.';
comment on column public.users.display_light_accent is 'Preferred hexadecimal accent colour for light mode.';
comment on column public.users.display_dark_accent is 'Preferred hexadecimal accent colour for dark mode.';
