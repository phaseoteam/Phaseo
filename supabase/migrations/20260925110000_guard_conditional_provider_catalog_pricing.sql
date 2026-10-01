-- The catalog candidate retains conditional prices for review. The current
-- promotion path writes one unconditional price per meter, so stop promotion
-- before it can silently flatten a conditional quote into a billable route.
create or replace function public.guard_conditional_provider_catalog_pricing()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.metadata ->> 'managed_by' = 'provider_catalog'
    and exists (
      select 1
      from public.v2_model_provider_routes route
      join public.provider_catalog_route_candidates candidate
        on candidate.run_id = (new.metadata ->> 'source_run_id')::uuid
       and candidate.provider_slug = route.provider_slug
       and candidate.canonical_model_slug = route.model_slug
       and candidate.provider_model_slug = route.provider_model_slug
      cross join lateral jsonb_array_elements(candidate.pricing) as price(value)
      where route.provider_model_id = new.provider_model_id
        and case when jsonb_typeof(price.value -> 'conditions') = 'array'
          then jsonb_array_length(price.value -> 'conditions') > 0
          else false end
    ) then
    raise exception 'provider_catalog_conditional_pricing_requires_review';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_conditional_provider_catalog_pricing on public.v2_pricing_skus;
create trigger guard_conditional_provider_catalog_pricing
before insert on public.v2_pricing_skus
for each row execute function public.guard_conditional_provider_catalog_pricing();
