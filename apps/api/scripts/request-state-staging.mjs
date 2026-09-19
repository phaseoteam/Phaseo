// Explicit staging-only diagnostic. Reads source configuration, creates isolated
// synthetic Cloudflare state, and never calls a model provider or spends credit.
import { readFileSync } from "node:fs";
import { parse } from "dotenv";
import { randomUUID } from "node:crypto";

const paths = process.argv.slice(2);
if (!paths.length) throw new Error("Pass environment file paths (credentials are never printed).");
const env = Object.assign({}, ...paths.map(path => parse(readFileSync(path))), process.env);
const base = "https://api-staging.phaseo.app";
const kids = [env.GATEWAY_API_KEY, env.PLAYGROUND_KEY].map(token => token?.split("_")[3]).filter(kid => kid && /^[A-Za-z0-9]+$/.test(kid));
if ((!kids.length && !env.REQUEST_STATE_SOURCE_KEY_ID) || !env.GATEWAY_INTERNAL_TEST_TOKEN || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_URL) {
    throw new Error("Missing staging diagnostic credentials");
}
const sourceFilter = env.REQUEST_STATE_SOURCE_KEY_ID
    ? `id=eq.${encodeURIComponent(env.REQUEST_STATE_SOURCE_KEY_ID)}` : `kid=in.(${kids.join(",")})`;
const sourceResult = await fetch(`${env.SUPABASE_URL}/rest/v1/keys?select=id,workspace_id,status&${sourceFilter}&status=eq.active&limit=1`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
});
if (!sourceResult.ok) throw new Error(`Source lookup failed: ${sourceResult.status}`);
const [source] = await sourceResult.json();
if (!source || source.status !== "active") throw new Error("Source key is not active");

async function post(path, body) {
    const response = await fetch(`${base}/internal/request-state/${path}`, { method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-token": env.GATEWAY_INTERNAL_TEST_TOKEN },
        body: JSON.stringify(body) });
    const value = await response.json();
    if (!response.ok) {
        // The endpoints return redacted errors. Never print a publication/token.
        console.error(JSON.stringify({ path, status: response.status, error: value.error, timings: value.timings, supabaseAttempts: value.supabaseAttempts }));
        throw new Error(`Staging ${path} failed`);
    }
    return value;
}
function stats(values) {
    const sorted = values.toSorted((a, b) => a - b);
    const p = quantile => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)];
    return { n: values.length, meanMs: values.reduce((a, b) => a + b, 0) / values.length, p50Ms: p(.5), p95Ms: p(.95), maxMs: sorted.at(-1) };
}

const model = env.REQUEST_STATE_TEST_MODEL ?? "openai/gpt-5-nano";
const cases = [
    { endpoint: "responses", body: { model, input: "Say hi", max_output_tokens: 16 } },
    { endpoint: "chat.completions", body: { model, messages: [{ role: "user", content: "Say hi" }], max_tokens: 16 } },
    { endpoint: "messages", body: { model, messages: [{ role: "user", content: "Say hi" }], max_tokens: 16 } },
];
if (env.REQUEST_STATE_TEST_MEDIA === "1") cases.push(
    { endpoint: "embeddings", body: { model: "google/gemini-embedding-2", input: "Hello" } },
    { endpoint: "moderations", body: { model: "openai/omni-moderation", input: "Hello" } },
    { endpoint: "audio.speech", body: { model: "xiaomi/mimo-v2.5-tts", input: "Hello", voice: "alloy" } },
    { endpoint: "images.generations", body: { model: "openai/gpt-image-1-mini", prompt: "A blue circle", n: 1, size: "1024x1024" } },
    { endpoint: "video.generation", body: { model: "google/veo-3.1-lite-preview", prompt: "A blue circle", duration: 4, size: "720p" } },
);
const published = await post("publish", { sourceWorkspaceId: source.workspace_id, sourceKeyId: source.id,
    targets: cases.map(({ endpoint, body }) => ({ model: body.model, endpoint })) });
console.log(JSON.stringify({ stage: "published", mode: published.mode, publications: published.publications }));
let completed = false;
try {
    const timings = [];
    for (const item of cases) {
        const results = [];
        for (let index = 0; index < 12; index++) {
            const result = await post("preflight", { ...item, token: published.token });
            if (!result.ok || result.supabaseAttempts !== 0) throw new Error("Preflight used Supabase");
            results.push(result.preflightMs);
            if (index === 0) console.log(JSON.stringify({ stage: "first-preflight", endpoint: item.endpoint, ...result }));
        }
        timings.push({ endpoint: item.endpoint, firstMs: results[0], warm: stats(results.slice(1)) });
    }
    console.log(JSON.stringify({ stage: "preflight-results", timings }));
    const common = { workspaceId: published.workspaceId, apiKeyId: published.apiKeyId };
    const ordinary = { ...common, reservationId: randomUUID(), action: "charge", amountNanos: 250 };
    const firstCharge = await post("wallet", ordinary);
    const chargeRetry = await post("wallet", ordinary);
    if (!firstCharge.applied || !chargeRetry.already_applied) throw new Error("Ordinary inference replay failed");
    const held = { ...common, reservationId: randomUUID(), kind: "hold" };
    const reserve = await post("wallet", { ...held, action: "reserve", amountNanos: 1000 });
    const settle = await post("wallet", { ...held, action: "settle", amountNanos: 400 });
    const replay = await post("wallet", { ...held, action: "settle", amountNanos: 400 });
    if (!reserve.applied || !settle.applied || !replay.alreadyApplied) throw new Error("Hold settlement replay failed");
    const cancelled = { ...common, reservationId: randomUUID(), kind: "hold" };
    await post("wallet", { ...cancelled, action: "reserve", amountNanos: 1000 });
    const release = await post("wallet", { ...cancelled, action: "release" });
    const releaseRetry = await post("wallet", { ...cancelled, action: "release" });
    if (!release.applied || !releaseRetry.alreadyApplied) throw new Error("Hold release replay failed");
    console.log(JSON.stringify({ stage: "accounting-results", ordinary: firstCharge.elapsedMs, reserveMs: reserve.elapsedMs,
        settleMs: settle.elapsedMs, releaseMs: release.elapsedMs, replaySafe: true }));
    const publicResponse = await fetch(`${base}/v1/responses`, { method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${published.token}` }, body: JSON.stringify(cases[0].body) });
    if (publicResponse.status !== 403) throw new Error("Synthetic key public dispatch guard failed");
    completed = true;
} finally {
    await post("revoke", { workspaceId: published.workspaceId, kid: published.kid });
}
if (completed) {
    const response = await fetch(`${base}/internal/request-state/preflight`, { method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-token": env.GATEWAY_INTERNAL_TEST_TOKEN },
        body: JSON.stringify({ ...cases[0], token: published.token }) });
    const result = await response.json();
    if (response.status !== 422 || result.supabaseAttempts !== 0 || result.pipelineStatus !== 401) throw new Error("Revocation test failed");
    console.log(JSON.stringify({ stage: "security-results", publicDispatchBlocked: true, immediateRevocation: true, supabaseAttempts: 0 }));
}
