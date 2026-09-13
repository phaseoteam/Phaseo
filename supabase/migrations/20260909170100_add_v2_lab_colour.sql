alter table public.v2_labs
  add column if not exists colour text;

update public.v2_labs
set colour = nullif(metadata->>'colour', '')
where colour is distinct from nullif(metadata->>'colour', '');
