CREATE OR REPLACE FUNCTION public.prevent_curated_benchmark_result_removal()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  -- Scraped results follow their leaderboard and may be removed; hand-entered results keep the end-date rule.
  if TG_OP = 'DELETE' and OLD.source_id is not null then return OLD; end if;
  raise exception 'saved catalogue records cannot be deleted; set an end date instead';
end $function$;

REVOKE ALL ON FUNCTION "public"."prevent_curated_benchmark_result_removal"() FROM PUBLIC, "anon", "authenticated", "service_role";
