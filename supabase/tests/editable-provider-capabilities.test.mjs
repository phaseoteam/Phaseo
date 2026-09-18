import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
	new URL("../migrations/20260917160756_editable_provider_capabilities.sql", import.meta.url),
	"utf8",
);

assert.match(migration, /create or replace function catalogue_private\.apply_v2_admin_model_capabilities/);
assert.match(migration, /previous_capability_id/);
assert.match(migration, /coalesce\(v_previous_capability_id, v_capability_id\)/);
assert.match(migration, /historical capabilities cannot be changed/);
assert.match(migration, /update public\.v2_route_capabilities\s+set capability_id = v_capability_id/);
assert.match(migration, /on conflict \(provider_model_id, capability_id\) do update/);
assert.match(migration, /create or replace function catalogue_private\.apply_v2_admin_model_provider_routes/);
assert.match(migration, /- 'provider_models' - 'provider_capabilities'/);
assert.match(migration, /provider_availability_status/);
assert.match(migration, /'deprecated'/);
assert.match(migration, /existing deprecated route during/);
assert.match(migration, /when v_route \? 'input_modalities'/);
assert.match(migration, /when v_route \? 'output_modalities'/);
assert.match(migration, /prompt_training_policy_override/);
assert.match(migration, /phaseo_status/);
assert.match(migration, /routable provider routes require phaseo_status=enabled/);
assert.match(migration, /on conflict \(provider_model_id\) do update set/);
assert.match(migration, /create or replace function public\.mutate_v2_admin_model_graph_editable/);
assert.match(migration, /coalesce\(p_payload, '\{\}'::jsonb\) - 'provider_models' - 'provider_capabilities'/);
assert.match(migration, /mutate_v2_admin_model_graph_with_successor/);
assert.match(migration, /security invoker/);
assert.match(migration, /grant execute on function public\.mutate_v2_admin_model_graph_editable\(uuid, text, jsonb\)\s+to service_role/);
assert.doesNotMatch(migration, /grant execute on function public\.mutate_v2_admin_model_graph_editable[\s\S]*\b(?:public|anon|authenticated)\b/);

console.log("Editable provider-capability migration contract is present and service-role only.");
