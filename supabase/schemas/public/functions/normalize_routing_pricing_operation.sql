create function public.normalize_routing_pricing_operation()
returns trigger language plpgsql security invoker
set search_path = pg_catalog, public
as $$
declare canonical text;
begin
  if lower(trim(new.operation)) in ('audio','audio.generate') then
    raise exception 'Generic audio pricing requires a reviewed model operation' using errcode='23514';
  end if;
  canonical := public.canonical_routing_capability_id(new.operation);
  if canonical is not null then new.operation := canonical; end if;
  return new;
end $$;

revoke all on function public.normalize_routing_pricing_operation() from public, anon, authenticated;
grant execute on function public.normalize_routing_pricing_operation() to service_role;
