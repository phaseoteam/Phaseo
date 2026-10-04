CREATE OR REPLACE FUNCTION public.normalize_gateway_request_embedding_tokens()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SET search_path TO 'public', 'pg_temp'
  AS $function$
begin
  new.usage_embedding_tokens :=
    case
      when coalesce(new.endpoint, '') = 'embeddings' then
        public.gateway_usage_nonnegative_bigint(
          coalesce(
            public.gateway_usage_numeric_field(
              new.usage,
              'embedding_tokens',
              'input_tokens',
              'prompt_tokens',
              'total_tokens'
            ),
            new.usage_embedding_tokens,
            0
          )
        )
      else greatest(coalesce(new.usage_embedding_tokens, 0), 0)
    end;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."normalize_gateway_request_embedding_tokens"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."normalize_gateway_request_embedding_tokens"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."normalize_gateway_request_embedding_tokens"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."normalize_gateway_request_embedding_tokens"() FROM PUBLIC, "anon", "authenticated";
