// Run against a disposable local database:
// SECURITY_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/postgres
// PSQL_PATH=/path/to/psql node --test scripts/security-alerts-20260905.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const databaseUrl = process.env.SECURITY_TEST_DATABASE_URL;
const migration = (name) => readFileSync(new URL(`../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
function sql(source) {
    assert.ok(databaseUrl, "A disposable local PostgreSQL database is required");
    assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(new URL(databaseUrl).hostname));
    return execFileSync(process.env.PSQL_PATH || "psql", ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", databaseUrl], {
        input: source, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
    });
}

test("tier health grants and catalogue repairs preserve role and retirement boundaries", { skip: !databaseUrl }, () => {
    const result = sql(`begin;
        create role anon; create role authenticated; create role service_role;
        create function public.get_v2_model_provider_tier_health_metrics(text, integer, numeric)
          returns integer language sql security definer as 'select 42';
        grant execute on function public.get_v2_model_provider_tier_health_metrics(text, integer, numeric) to anon, authenticated;
        create table public.v2_model_provider_routes (
          provider_model_id text, provider_slug text, provider_availability_status text,
          routing_enabled boolean, effective_to timestamptz, input_modalities text[]);
        create table public.v2_route_capabilities (provider_model_id text, capability_id text, status text);
        insert into public.v2_model_provider_routes values
          ('weights-and-biases:ibm/granite-4.1-8b', 'weights-and-biases', 'deprecated', true, '2026-09-28T00:00:00Z', array['text']),
          ('weights-and-biases:deepseek/deepseek-v4-flash', 'weights-and-biases', 'deprecated', true, now() - interval '1 day', array['text']),
          ('weights-and-biases:deepseek/deepseek-v4-pro', 'weights-and-biases', 'deprecated', true, null, array['text']),
          ('weights-and-biases:meta/llama-3.1-70b', 'weights-and-biases', 'deprecated', false, '2026-09-28T00:00:00Z', array['text']),
          ('weights-and-biases:qwen/qwen3-14b', 'another-provider', 'deprecated', true, '2026-09-28T00:00:00Z', array['text']),
          ('other', 'weights-and-biases', 'deprecated', true, '2026-09-28T00:00:00Z', array['text']),
          ('crofai:deepseek-v4-flash-vision-exp', 'crofai', 'available', true, null, array['text','image']);
        insert into public.v2_route_capabilities select provider_model_id, 'text.generate', 'degraded' from public.v2_model_provider_routes;
        ${migration("20260905140000_secure_tier_health_and_restore_catalogue_routes")}
        select has_function_privilege('anon', 'public.get_v2_model_provider_tier_health_metrics(text,integer,numeric)', 'execute'),
          has_function_privilege('authenticated', 'public.get_v2_model_provider_tier_health_metrics(text,integer,numeric)', 'execute'),
          has_function_privilege('service_role', 'public.get_v2_model_provider_tier_health_metrics(text,integer,numeric)', 'execute');
        set local role service_role;
        select public.get_v2_model_provider_tier_health_metrics('fixture', 3, 0.5);
        reset role;
        select provider_model_id from public.v2_route_capabilities where status = 'active';
        select input_modalities from public.v2_model_provider_routes where provider_slug = 'crofai';
        rollback;`);
    const active = Date.now() < Date.parse("2026-09-28T00:00:00Z") ? ["weights-and-biases:ibm/granite-4.1-8b"] : [];
    assert.deepEqual(result.trim().split(/\r?\n/), ["f|f|t", "42", ...active, "{text}"]);
});

test("the existing predecessor repair prevents the reported pricing comma failure", { skip: !databaseUrl }, () => {
    // Minimal executable projection preserving the exact patch sites from the
    // installed pricing function. Execute the actual migration DO blocks.
    const setup = `begin;
      create function public.get_v2_model_pricing_without_stealth_redaction(text,text,text)
      returns jsonb language sql as $body$
      with model as (select variant.data_region,
      variant.status as variant_status,
      variant.routing_enabled as variant_routing_enabled,
      capability.capability_id,
      route.provider_availability_status
      from (values ('deprecated', now() - interval '1 day', now() + interval '1 day')) route(provider_availability_status,effective_from,effective_to),
           (values ('eu','active',true)) variant(data_region,status,routing_enabled),
           (values ('text.generate')) capability(capability_id))
      select jsonb_build_object('active', true
          and model.provider_availability_status in ('available', 'preview', 'limited_access'),
        'data_region', model.data_region
      ) from model;
      $body$;
    `;
    const pricingBlock = (name) => migration(name).match(/do \$\$[\s\S]*?end;\s*\$\$;/i)[0];
    assert.throws(() => sql(`${setup}${pricingBlock("20260905130000_align_provider_retirement_routing")}rollback;`), /syntax error/);
    const result = sql(`${setup}
      ${migration("20260905095900_repair_pending_provider_retirement_migration")}
      ${pricingBlock("20260905100000_align_provider_retirement_routing")}
      ${pricingBlock("20260905130000_align_provider_retirement_routing")}
      ${pricingBlock("20260905133000_reconcile_provider_retirement_routing")}
      select public.get_v2_model_pricing_without_stealth_redaction('fixture',null,null)->>'active';
      rollback;`);
    assert.equal(result.trim(), "true");
});
