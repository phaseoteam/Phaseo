create or replace function public.sync_v2_lab_colour()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.colour := nullif(new.metadata->>'colour', '');
  return new;
end;
$$;

drop trigger if exists sync_v2_lab_colour_from_metadata on public.v2_labs;
create trigger sync_v2_lab_colour_from_metadata
before insert or update of metadata on public.v2_labs
for each row execute function public.sync_v2_lab_colour();

update public.v2_labs
set colour = nullif(metadata->>'colour', '')
where colour is distinct from nullif(metadata->>'colour', '');
