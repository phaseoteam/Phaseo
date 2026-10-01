// Explicit operator-only probe: staging, two verified free Poolside routes,
// twelve requests, <=16 requested output tokens, disposable key, no wallet edits.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { parse } from "dotenv";

const env = Object.assign({}, ...process.argv.slice(2).map(path => parse(readFileSync(path))));
if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.KEY_PEPPER_ACTIVE) throw new Error("Missing operator configuration");
const database = "https://xansbgjaduxypzsmjwct.supabase.co/rest/v1/";
const gateway = "https://api-staging.phaseo.app";
const workspace = "72528cb6-603a-4e70-853f-709ef81b4851";
const models = ["poolside/laguna-xs-2.1:free", "poolside/laguna-s-2.1:free"];
async function query(path, method = "GET", body) {
    const response = await fetch(database + path, { method, signal: AbortSignal.timeout(15_000),
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            "content-type": "application/json", Prefer: "return=representation" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Database operation failed: ${response.status}`);
    return response.status === 204 ? null : response.json();
}
const [target] = await query(`workspaces?id=eq.${workspace}&select=id,name,owner_user_id`);
const [owner] = await query("workspaces?id=eq.6108396e-0e12-425d-91ff-a02d39a346e0&select=owner_user_id");
assert.ok(target?.name === "Codex Live Workspace Manual" && target.owner_user_id === owner?.owner_user_id, "Unexpected test workspace");
for (const model of models) {
    const routes = await query(`v2_model_provider_routes?model_slug=eq.${encodeURIComponent(model)}&provider_slug=eq.poolside&routing_enabled=eq.true&status=eq.active&select=provider_model_id`);
    assert.equal(routes.length, 1, "Free route unavailable");
    const skus = await query(`v2_pricing_skus?provider_model_id=eq.${routes[0].provider_model_id}&status=eq.active&operation=eq.text.generate&effective_to=is.null&select=sku_id`);
    assert.ok(skus.length, "Missing free pricing");
    for (const sku of skus) {
        const meters = await query(`v2_pricing_sku_meters?sku_id=eq.${sku.sku_id}&select=price_nanos`);
        assert.ok(meters.length && meters.every(meter => Number(meter.price_nanos) === 0), "Nonzero pricing; refusing probe");
    }
}
const id = randomUUID(), kid = randomBytes(9).toString("hex"), secret = randomBytes(30).toString("hex");
const key = `phaseo_v1_sk_${kid}_${secret}`;
const records = [];
let created = false;

async function readBounded(response, start) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder(); let text = "", bytes = 0, firstByteMs = null;
    try {
        while (true) {
            const { done, value } = await reader.read(); if (done) break;
            bytes += value.byteLength;
            if (bytes > 262_144) { await reader.cancel(); throw new Error("Probe response exceeds bound"); }
            if (value.byteLength) firstByteMs ??= Math.round(performance.now() - start);
            text += decoder.decode(value, { stream: true });
        }
        return { text: text + decoder.decode(), firstByteMs, bytes };
    } finally { reader.releaseLock(); }
}
function checkBody(surface, stream, text) {
    if (!stream) {
        const body = JSON.parse(text);
        assert.ok(!body.error, "Protocol error response");
        if (surface === "chat/completions") assert.ok(body.choices?.[0]?.message && body.choices[0].finish_reason, "Missing Chat completion");
        if (surface === "responses") {
            const allowed = ["completed", "incomplete", "failed", "in_progress", "queued", "cancelled"];
            console.log(JSON.stringify({ event: "responses_contract", status: allowed.includes(body.status) ? body.status : "unknown",
                hasOutput: Array.isArray(body.output), incompleteReason: body.incomplete_details?.reason === "max_output_tokens" ? "max_output_tokens" : null }));
            assert.ok((body.status === "completed" || (body.status === "incomplete" && body.incomplete_details?.reason === "max_output_tokens"))
                && Array.isArray(body.output), "Missing Responses completion");
        }
        if (surface === "messages") assert.ok(body.type === "message" && body.stop_reason, "Missing Messages completion");
        return;
    }
    const frames = text.split(/\r?\n\r?\n/).filter(frame => frame.trim());
    assert.ok(frames.length, "Missing SSE frames");
    let terminal = false;
    const types = new Map();
    for (const frame of frames) {
        const data = frame.split(/\r?\n/).filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
        if (!data) continue;
        if (data === "[DONE]") { if (surface === "chat/completions") terminal = true; continue; }
        const body = JSON.parse(data);
        const type = typeof body.type === "string" && /^[a-z_.]{1,80}$/.test(body.type) ? body.type : "untyped";
        types.set(type, (types.get(type) ?? 0) + 1);
        if (body.error || body.type === "error" || body.type === "response.failed") {
            const code = body.error?.code ?? body.code;
            console.log(JSON.stringify({ event: "sse_failure", surface, type,
                code: typeof code === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(code) ? code : null }));
        }
        assert.ok(!body.error && body.type !== "error" && body.type !== "response.failed", "SSE error event");
        if (surface === "responses" && body.type === "response.completed") {
            assert.equal(body.response?.status, "completed", "Responses terminal status"); terminal = true;
        }
        if (surface === "responses" && body.type === "response.incomplete") {
            assert.ok(body.response?.status === "incomplete" && body.response?.incomplete_details?.reason === "max_output_tokens", "Responses terminal status");
            terminal = true;
        }
        if (surface === "messages" && body.type === "message_stop") terminal = true;
    }
    console.log(JSON.stringify({ event: "sse_contract", surface, frames: frames.length, terminal, types: Object.fromEntries(types) }));
    assert.ok(terminal, "Missing protocol terminal event");
}

try {
    await query("keys", "POST", { id, workspace_id: workspace, name: "Temporary staging Poolside protocol matrix", kid,
        hash: createHmac("sha256", env.KEY_PEPPER_ACTIVE.trim()).update(secret).digest("hex"),
        prefix: kid.slice(0, 6), status: "active", scopes: "[]", created_by: target.owner_user_id,
        expires_at: new Date(Date.now() + 15 * 60_000).toISOString() });
    created = true;
    console.log(JSON.stringify({ event: "temporary_key_created", keyId: id, maximumRequests: 12 }));
    for (const model of models) for (const surface of ["chat/completions", "responses", "messages"]) for (const stream of [false, true]) {
        const body = { model, stream, provider: { only: ["poolside"], allow_fallbacks: false },
            ...(surface === "responses" ? { input: "Reply with the word hello.", max_output_tokens: 16 }
                : { messages: [{ role: "user", content: "Reply with the word hello." }], max_tokens: 16 }) };
        const start = performance.now();
        const response = await fetch(`${gateway}/v1/${surface}`, { method: "POST", signal: AbortSignal.timeout(45_000),
            headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "anthropic-version": "2023-06-01" },
            body: JSON.stringify(body) });
        const payload = await readBounded(response, start);
        const record = { model, surface, stream, status: response.status, requestId: response.headers.get("x-request-id"),
            colo: response.headers.get("cf-ray")?.split("-").at(-1), firstBodyByteMs: payload.firstByteMs,
            totalMs: Math.round(performance.now() - start), bytes: payload.bytes };
        records.push(record);
        console.log(JSON.stringify({ event: "protocol_probe", ...record }));
        assert.equal(response.status, 200, "Gateway request failed");
        checkBody(surface, stream, payload.text);
    }
    let logs = [];
    for (let attempt = 0; attempt < 5; attempt++) {
        logs = await query(`gateway_requests?key_id=eq.${id}&order=created_at.asc&select=request_id,status_code,success,provider,model_id,cost_nanos,detail_metadata`);
        if (logs.length >= records.length) break;
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    assert.equal(logs.length, records.length, "Missing request logs");
    assert.ok(logs.every(row => row.status_code === 200 && row.success && row.provider === "poolside" && models.includes(row.model_id) && Number(row.cost_nanos) === 0), "Charge/provider/result verification failed");
    console.log(JSON.stringify({ event: "protocol_matrix_pass", requests: records.length, zeroCostVerified: true,
        routingMs: logs.map(row => row.detail_metadata?.response_timeline?.routing_ms ?? null) }));
} catch (error) {
    // Never print request bodies, keys, provider payloads or database errors.
    const reasons = ["Protocol error response", "Missing Chat completion", "Missing Responses completion", "Missing Messages completion",
        "Missing SSE frames", "SSE error event", "Responses terminal status", "Missing protocol terminal event", "Gateway request failed",
        "Missing request logs", "Charge/provider/result verification failed"];
    console.error(JSON.stringify({ event: "protocol_matrix_failed", completedRequests: records.length,
        reason: reasons.find(reason => error?.message?.startsWith(reason)) ?? null,
        errorType: error instanceof assert.AssertionError ? "contract_assertion" : "probe_error" }));
    process.exitCode = 1;
} finally {
    if (created) {
        await query(`keys?id=eq.${id}&workspace_id=eq.${workspace}`, "PATCH", { status: "revoked", revoked_at: new Date().toISOString(),
            revoked_reason: "Completed staging Poolside protocol matrix", expires_at: new Date().toISOString() });
        console.log(JSON.stringify({ event: "temporary_key_revoked", keyId: id }));
    }
}
