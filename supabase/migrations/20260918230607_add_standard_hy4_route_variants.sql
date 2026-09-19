-- phaseo:allow-production-history-backfill reason: Restore migration 20260918230607 already applied in production; SQL recovered from supabase_migrations.schema_migrations.
-- This records existing production history so deployment can resume without replaying the repair.

    insert into public.v2_route_variants (
      provider_model_id,
      variant_key,
      service_tier_slug,
      status,
      routing_enabled,
      endpoint_label,
      metadata
    )
    values
      (
        'novita:tencent/hy4-preview',
        'global:standard',
        'standard',
        'active',
        true,
        'standard',
        jsonb_build_object(
          'scope', 'global',
          'source', 'admin_repair'
        )
      ),
      (
        'tencent-cloud:hy4-preview',
        'global:standard',
        'standard',
        'disabled',
        false,
        'standard',
        jsonb_build_object(
          'scope', 'global',
          'source', 'admin_repair'
        )
      )
    on conflict (provider_model_id, variant_key) do update
      set service_tier_slug = excluded.service_tier_slug,
          status = excluded.status,
          routing_enabled = excluded.routing_enabled,
          endpoint_label = excluded.endpoint_label,
          metadata = excluded.metadata,
          updated_at = now();

    update public.v2_pricing_skus sku
    set route_variant_id = variant.variant_id,
        updated_at = now()
    from public.v2_route_variants variant
    where variant.provider_model_id = sku.provider_model_id
      and variant.variant_key = 'global:standard'
      and variant.service_tier_slug = sku.service_tier_slug
      and sku.provider_model_id in (
        'novita:tencent/hy4-preview',
        'tencent-cloud:hy4-preview'
      );
