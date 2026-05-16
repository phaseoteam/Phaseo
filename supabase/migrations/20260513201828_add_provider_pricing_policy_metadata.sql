alter table public.data_api_providers
    add column if not exists regional_pricing_mode text,
    add column if not exists regional_pricing_uplift_percent numeric,
    add column if not exists pricing_source_url text,
    add column if not exists regional_pricing_notes text;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'data_api_providers_regional_pricing_mode_check'
          and conrelid = 'public.data_api_providers'::regclass
    ) then
        alter table public.data_api_providers
            add constraint data_api_providers_regional_pricing_mode_check
            check (
                regional_pricing_mode is null
                or regional_pricing_mode in (
                    'unknown',
                    'same_as_global',
                    'uplift',
                    'source_region_rates',
                    'offer_specific'
                )
            );
    end if;
end $$;
