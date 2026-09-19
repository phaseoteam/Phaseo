// Deliberately bounded operator probe: staging only, one owned test workspace,
// one zero-priced Poolside route, temporary key, no wallet writes.
import { readFileSync } from "node:fs";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { parse } from "dotenv";

const env = Object.assign({}, ...process.argv.slice(2).map(path => parse(readFileSync(path))));
const db = "https://xansbgjaduxypzsmjwct.supabase.co/rest/v1/";
const workspace = "72528cb6-603a-4e70-853f-709ef81b4851";
const model = "poolside/laguna-s-2.1:free";
const base = "https://api-staging.phaseo.app";
if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.KEY_PEPPER_ACTIVE) throw new Error("Missing operator configuration");
async function query(path, method = "GET", body) {
  const response = await fetch(db + path, {
    method, signal: AbortSignal.timeout(15000),
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json", Prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Database ${method} failed: ${response.status}`);
  return response.status === 204 ? null : response.json();
}
const [target] = await query(`workspaces?id=eq.${workspace}&select=id,name,owner_user_id`);
const [owner] = await query("workspaces?id=eq.6108396e-0e12-425d-91ff-a02d39a346e0&select=owner_user_id");
if (!target || target.name !== "Codex Live Workspace Manual" || target.owner_user_id !== owner?.owner_user_id) throw new Error("Unexpected test workspace");
const routes = await query(`v2_model_provider_routes?model_slug=eq.${encodeURIComponent(model)}&provider_slug=eq.poolside&routing_enabled=eq.true&status=eq.active&select=provider_model_id`);
if (routes.length !== 1) throw new Error("Free route unavailable");
const skus = await query(`v2_pricing_skus?provider_model_id=eq.${routes[0].provider_model_id}&status=eq.active&operation=eq.text.generate&effective_to=is.null&select=sku_id`);
if (!skus.length) throw new Error("No active free pricing");
for (const sku of skus) {
  const meters = await query(`v2_pricing_sku_meters?sku_id=eq.${sku.sku_id}&select=price_nanos`);
  if (!meters.length || meters.some(m => Number(m.price_nanos) !== 0)) throw new Error("Nonzero or missing pricing; refusing probe");
}
const id = randomUUID();
const kid = randomBytes(9).toString("hex");
const secret = randomBytes(30).toString("hex");
const key = `phaseo_v1_sk_${kid}_${secret}`;
const records = [];
let created = false;
try {
  await query("keys", "POST", {
    id, workspace_id: workspace, name: "Temporary staging free-model overhead probe", kid,
    hash: createHmac("sha256", env.KEY_PEPPER_ACTIVE.trim()).update(secret).digest("hex"),
    prefix: kid.slice(0, 6), status: "active", scopes: "[]", created_by: target.owner_user_id,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  });
  created = true;
  console.log(JSON.stringify({ event: "temporary_key_created", key_id: id, workspace: target.name, model }));
  for (let i = 0; i < 6; i++) {
    const start = performance.now();
    const response = await fetch(`${base}/v1/chat/completions`, {
      method: "POST", signal: AbortSignal.timeout(45000),
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with the word hello." }], max_tokens: 16, stream: false, provider: { only: ["poolside"], allow_fallbacks: false } }),
    });
    const headerMs = performance.now() - start;
    const body = await response.json();
    const result = { sample: i + 1, status: response.status, client_header_ms: Math.round(headerMs), client_total_ms: Math.round(performance.now() - start), transport_request_id: response.headers.get("x-request-id"), generation_id: body.generation_id ?? body.request_id ?? body.id, cf_ray: response.headers.get("cf-ray"), server_timing: response.headers.get("server-timing"), error_code: body.error?.code ?? (typeof body.error === "string" ? body.error : undefined) };
    console.log(JSON.stringify(result));
    records.push(result);
    if (!response.ok) break;
  }
  // Background request logging can finish after the response.
  let logs = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    logs = await query(`gateway_requests?key_id=eq.${id}&order=created_at.asc&select=request_id,status_code,success,provider,model_id,cost_nanos,latency_ms,generation_ms,phaseo_overhead_ms,provider_ttft_ms,gateway_ttft_ms,trace_data,detail_metadata`);
    if (logs.length >= records.length) break;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  console.log(JSON.stringify({ event: "request_logs", key_id: id, rows: logs.map(({trace_data,detail_metadata,...row}) => ({ ...row, request_log_overhead_ms: detail_metadata?.response_timeline?.version === 1 ? detail_metadata.response_timeline.routing_ms : null })) }));
} finally {
  if (created) {
    await query(`keys?id=eq.${id}&workspace_id=eq.${workspace}`, "PATCH", { status: "revoked", revoked_at: new Date().toISOString(), revoked_reason: "Completed staging free-model overhead probe", expires_at: new Date().toISOString() });
    console.log(JSON.stringify({ event: "temporary_key_revoked", key_id: id }));
  }
}
