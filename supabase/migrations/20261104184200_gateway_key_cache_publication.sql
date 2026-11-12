-- Any change to an API key or a workspace budget queues a workspace cache publication.
--
-- The publication drain bumps the workspace cache version, and every gateway cache keyed on it
-- (key lookups, request contexts, workspace policies) then reloads. That makes the refresh
-- independent of who wrote the row: SCIM deprovisioning (whose membership trigger revokes keys),
-- the Slack uninstall, admin SQL, or a control route whose own invalidation call failed.
--
-- capture_gateway_workspace_publication ignores updates that only touch updated_at or
-- last_used_at, so the gateway's authentication usage writes create no publication traffic.
-- Budgets decide whether a key counts as capped, which changes how its context is cached.

DROP TRIGGER IF EXISTS keys_department_gateway_publication ON public.keys;

CREATE TRIGGER gateway_workspace_publication
  AFTER UPDATE OR DELETE ON public.keys
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_gateway_workspace_publication();

CREATE TRIGGER gateway_workspace_publication
  AFTER INSERT OR DELETE OR UPDATE ON public.workspace_budgets
  FOR EACH ROW
  EXECUTE FUNCTION private.capture_gateway_workspace_publication();
