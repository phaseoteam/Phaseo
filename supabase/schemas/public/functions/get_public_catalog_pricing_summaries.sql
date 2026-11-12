CREATE OR REPLACE FUNCTION public.get_public_catalog_pricing_summaries()
  RETURNS TABLE (
    api_model_id                       text,
    lowest_input_price                 numeric,
    lowest_output_price                numeric,
    lowest_standard_input_price        numeric,
    lowest_standard_output_price       numeric,
    lowest_standard_input_price_label  text,
    lowest_standard_input_price_unit   text,
    lowest_standard_output_price_label text,
    lowest_standard_output_price_unit  text,
    lowest_from_price                  numeric,
    lowest_from_price_unit             text,
    pricing_detail_rows                jsonb
  )
  LANGUAGE sql
  STABLE
  SET search_path TO 'public'
  AS $function$
  with unexpired as (
    select
      regexp_replace(rule.model_key, '^[^:]+:(.*):[^:]+$', '\1') as api_model_id,
      lower(coalesce(rule.meter, '')) as meter,
      lower(coalesce(rule.unit, '')) as unit,
      rule.note,
      rule.unit_size::numeric as unit_size,
      rule.price_per_unit::numeric as price_per_unit,
      coalesce(rule.effective_from <= now(), true) as is_active
    from private.v2_rpc_pricing_compat rule
    where lower(coalesce(rule.pricing_plan, 'standard')) = 'standard'
      and (rule.effective_to is null or rule.effective_to > now())
      and rule.model_key ~ '^[^:]+:.+:[^:]+$'
  ),
  eligible as (
    select
      unexpired.*,
      bool_or(is_active) over (partition by api_model_id) as has_active
    from unexpired
  ),
  normalized as (
    select
      eligible.*,
      case
        when note ~* '\$[0-9.]+\s*/\s*minute' then (substring(note from '\$([0-9.]+)\s*/\s*minute'))::numeric
        when price_per_unit is null or unit_size is null or unit_size <= 0 then null
        when meter like '%token%' or unit in ('token', 'tokens') then price_per_unit * (1000000::numeric / unit_size)
        when unit in ('minute', 'minutes', 'min', 'mins', 'm') then price_per_unit / unit_size / 60
        when unit in ('hour', 'hours', 'hr', 'hrs', 'h') then price_per_unit / unit_size / 3600
        else price_per_unit / unit_size
      end as display_price,
      case
        when note ~* '\$[0-9.]+\s*/\s*minute' then 'minute'
        when meter like '%token%' or unit in ('token', 'tokens') then '1M tokens'
        when unit in ('minute', 'minutes', 'min', 'mins', 'm', 'hour', 'hours', 'hr', 'hrs', 'h', 'second', 'seconds', 'sec', 'secs', 's') then 'second'
        when unit in ('image', 'images') then 'image'
        when unit in ('video', 'videos') then 'video'
        when unit in ('character', 'characters', 'char', 'chars') then 'character'
        else nullif(unit, '')
      end as display_unit,
      case
        when meter in ('input_text_tokens', 'input_tokens') then 'Text Input'
        when meter in ('input_audio_tokens', 'input_audio') then 'Audio Input'
        when meter in ('input_image_tokens', 'input_image') then 'Image Input'
        when meter in ('input_video_tokens', 'input_video') then 'Video Input'
        when meter in ('output_text_tokens', 'output_tokens') then 'Text Output'
        when meter in ('output_audio_tokens', 'output_audio', 'output_audio_seconds') then 'Audio Output'
        when meter in ('output_image_tokens', 'output_image') then 'Image Output'
        when meter in ('output_video_tokens', 'output_video', 'output_video_seconds') then 'Video Output'
        else null
      end as display_label,
      case
        when meter in ('input_text_tokens', 'input_tokens', 'input_audio_tokens', 'input_audio', 'input_image_tokens', 'input_image', 'input_video_tokens', 'input_video') then 'input'
        when meter in ('output_text_tokens', 'output_tokens', 'output_audio_tokens', 'output_audio', 'output_audio_seconds', 'output_image_tokens', 'output_image', 'output_video_tokens', 'output_video', 'output_video_seconds') then 'output'
        else null
      end as side
    from eligible
    where is_active or not has_active
  ),
  grouped as (
    select
      api_model_id,
      min(display_price) filter (where side = 'input') as input_price,
      min(display_price) filter (where side = 'output') as output_price,
      (array_agg(display_label order by display_price) filter (where side = 'input' and display_price is not null and display_label is not null))[1] as input_label,
      (array_agg(display_unit order by display_price) filter (where side = 'input' and display_price is not null and display_unit is not null))[1] as input_unit,
      (array_agg(display_label order by display_price) filter (where side = 'output' and display_price is not null and display_label is not null))[1] as output_label,
      (array_agg(display_unit order by display_price) filter (where side = 'output' and display_price is not null and display_unit is not null))[1] as output_unit,
      min(display_price) as from_price,
      case when count(distinct display_unit) filter (where display_price is not null and display_unit is not null) = 1
        then min(display_unit) filter (where display_price is not null and display_unit is not null)
        else null
      end as from_unit
    from normalized
    where display_price is not null and display_unit is not null
    group by api_model_id
  )
  select
    grouped.api_model_id,
    grouped.input_price,
    grouped.output_price,
    grouped.input_price,
    grouped.output_price,
    grouped.input_label,
    grouped.input_unit,
    grouped.output_label,
    grouped.output_unit,
    case when grouped.from_unit is not null then grouped.from_price else null end,
    grouped.from_unit,
    coalesce(details.rows, '[]'::jsonb)
  from grouped
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'label', detail.display_label,
        'value',
          case
            when detail.display_price = 0 then '$0'
            when detail.display_price < 0.001 then '$' || to_char(detail.display_price, 'FM999999999990.0000')
            when detail.display_price < 0.1 then '$' || to_char(detail.display_price, 'FM999999999990.000')
            when detail.display_price < 1 then '$' || to_char(detail.display_price, 'FM999999999990.00')
            else '$' || trim(trailing '.' from trim(trailing '0' from to_char(detail.display_price, 'FM999999999990.00')))
          end || ' / ' || detail.display_unit
      ) order by detail.display_price, detail.display_label
    ) as rows
    from (
      select distinct display_label, display_price, display_unit
      from normalized
      where normalized.api_model_id = grouped.api_model_id
        and side is not null
        and display_label is not null
        and display_price is not null
        and display_unit is not null
      order by display_price, display_label
      limit 6
    ) detail
  ) details on true;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_public_catalog_pricing_summaries"() TO PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."get_public_catalog_pricing_summaries"() TO "service_role";

COMMENT ON FUNCTION "public"."get_public_catalog_pricing_summaries"() IS 'Normalizes active (or next upcoming) standard pricing rules into one display summary per API model for public catalogue cards.';

REVOKE ALL ON FUNCTION "public"."get_public_catalog_pricing_summaries"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_public_catalog_pricing_summaries"() TO "postgres";
