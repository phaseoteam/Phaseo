-- Timestamp matches the migration service's applied history entry, after the
-- existing 090000 exposure migration. Originally scaffolded with the CLI.
-- Public HTTP IDs are not financial identities. Only the trusted server billing
-- ID in audit metadata may offset a free-model hold. No data/grants are changed.
do $$
declare
  definition text;
  predicate text := $old$and gr.request_id = r.hold_ref_id$old$;
begin
  select pg_get_functiondef(
    'public.gateway_wallet_reserve_once_without_workspace_budget(uuid,text,bigint,text,uuid,integer)'::regprocedure
  ) into definition;
  if (length(definition) - length(replace(definition, predicate, ''))) / length(predicate) <> 1 then
    raise exception 'free_model_key_audit_identity_prerequisite_changed';
  end if;
  execute replace(definition, predicate, $new$and gr.request_id = r.hold_ref_id
          and (r.reservation_id not like 'free_model_hold:%' or
            gr.detail_metadata->>'free_model_fee_request_id' = substr(r.reservation_id, 17))$new$);

  select pg_get_functiondef('public.gateway_workspace_budget_status(uuid,bigint)'::regprocedure) into definition;
  predicate := 'and request.request_id = reservation.hold_ref_id';
  if (length(definition) - length(replace(definition, predicate, ''))) / length(predicate) <> 1 then
    raise exception 'free_model_workspace_audit_identity_prerequisite_changed';
  end if;
  execute replace(definition, predicate, $new$and request.request_id = reservation.hold_ref_id
        and request.detail_metadata->>'free_model_fee_request_id' = substr(reservation.reservation_id, 17)$new$);
end;
$$;
