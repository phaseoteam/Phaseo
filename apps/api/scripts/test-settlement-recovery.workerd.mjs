import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
const require = createRequire(import.meta.url), wrangler = createRequire(require.resolve("wrangler/package.json"));
const { build } = wrangler("esbuild"), { Miniflare } = wrangler("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const workspaceId = "10000000-0000-4000-8000-000000000001";
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false,
    external: ["cloudflare:*", "node:*"], stdin: { resolveDir: root, loader: "ts", contents: `
        import { handleSettlementRecoveryBatch, enqueueSettlementRecovery } from './src/core/settlement-recovery';
        import { configureRuntime, clearRuntime } from './src/runtime/env';
        import { recordUsageAndChargeOnce } from './src/pipeline/after/charge';
        export default {
            queue: handleSettlementRecoveryBatch,
            async fetch(request, env, execution) {
                const delayedConfirmation = new URL(request.url).pathname === '/ambiguous-send';
                const bindings = delayedConfirmation ? { ...env, SETTLEMENT_RECOVERY_QUEUE: {
                    async send(body, options) {
                        await env.SETTLEMENT_RECOVERY_QUEUE.send(body, options);
                        const delayed = new Promise(resolve => setTimeout(resolve, 7_000));
                        execution.waitUntil(delayed);
                        await delayed;
                    }
                } } : env;
                configureRuntime(bindings);
                try {
                    const input = await request.json();
                    if (new URL(request.url).pathname === '/direct') {
                        const ctx = { requestId: 'public', billingRequestId: input.requestId, workspaceId: input.workspaceId, meta: {} };
                        await Promise.all(Array.from({ length: 16 }, () => recordUsageAndChargeOnce({ ctx,
                            costNanos: input.cost_nanos, endpoint: 'responses' })));
                        return Response.json({ queued: ctx.meta.__usageChargeRecoveryEnqueued === true,
                            recorded: ctx.meta.__usageChargeRecorded === true });
                    }
                    try { return Response.json({ queued: await enqueueSettlementRecovery(input) }); }
                    catch (error) {
                        if (delayedConfirmation && error.message === 'settlement_transfer_unconfirmed') {
                            return Response.json({ confirmed: false });
                        }
                        throw error;
                    }
                }
                finally { clearRuntime(); }
            }
        };
    ` } });
// The mocked source survives replacement of the entire Worker. It implements
// the existing RPC's workspace/request/amount fence; this is not a live DB test.
const ledger = new Map(), deadLetters = [], chargeCalls = [];
let lostResponse = false;
async function source(request) {
    const url = new URL(request.url);
    if (url.hostname === "dead-letter.invalid") {
        deadLetters.push(...await request.json());
        return new Response(null, { status: 204 });
    }
    assert.equal(url.hostname, "source.invalid", "No provider, Stripe or other outbound calls");
    if (url.pathname === "/rest/v1/workspace_settings") return Response.json(null);
    assert.equal(url.pathname, "/rest/v1/rpc/gateway_charge_with_credit_cache");
    const input = await request.json();
    chargeCalls.push(input);
    if (input.p_request_id === "permanent") return Response.json({ message: "fixture failure" }, { status: 503 });
    const identity = `${input.p_workspace_id}:${input.p_request_id}`;
    if (input.p_request_id === "direct-handoff") {
        // The first debit commits, but each of the three direct attempts loses
        // its response to the real client's five-second transport deadline.
        if (!ledger.has(identity)) ledger.set(identity, input.p_cost_nanos);
        assert.equal(ledger.get(identity), input.p_cost_nanos);
        if (chargeCalls.filter(call => call.p_request_id === "direct-handoff").length <= 3) await delay(7_000);
    }
    if (ledger.has(identity)) {
        if (ledger.get(identity) !== input.p_cost_nanos) return Response.json({ message: "request_charge_amount_mismatch" }, { status: 409 });
        return Response.json({ status: "top_up_not_required", already_applied: true, invalidate_credit_cache: true });
    }
    ledger.set(identity, input.p_cost_nanos);
    if (input.p_request_id === "stalled-response") {
        // Commit before the transport stalls: abort cannot establish rollback.
        await delay(7_000);
    }
    if (input.p_request_id === "lost-response" && !lostResponse) {
        lostResponse = true;
        return Response.json({ message: "response lost after commit" }, { status: 504 });
    }
    return Response.json({ status: "top_up_not_required", applied: true, invalidate_credit_cache: false });
}
function runtime() {
    return new Miniflare({ workers: [{ name: "recovery",
        modules: [{ type: "ESModule", path: "recovery.mjs", contents: bundle.outputFiles[0].text }],
        compatibilityDate: "2025-10-01", compatibilityFlags: ["nodejs_compat"], kvNamespaces: ["GATEWAY_CACHE"],
        bindings: { SUPABASE_URL: "https://source.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture",
            GATEWAY_SETTLEMENT_RECOVERY_ENABLED: "true", GATEWAY_SETTLEMENT_RECOVERY_QUEUE_NAME: "recovery" },
        queueProducers: { SETTLEMENT_RECOVERY_QUEUE: "recovery", SETTLEMENT_RECOVERY_DEAD_LETTER: "dead-letter" },
        queueConsumers: { recovery: { maxBatchSize: 1, maxBatchTimeout: 0, maxRetries: 5, deadLetterQueue: "dead-letter" } },
        outboundService: source,
    }, { name: "quarantine",
        modules: [{ type: "ESModule", path: "quarantine.mjs", contents: `export default {
            async queue(batch) {
                await fetch('https://dead-letter.invalid/', { method: 'POST', body: JSON.stringify(batch.messages.map(m => m.body)) });
            }
        };` }],
        compatibilityDate: "2025-10-01", queueConsumers: { "dead-letter": { maxBatchSize: 1, maxBatchTimeout: 0 } },
        outboundService: source,
    }] });
}
const record = requestId => ({ version: 1, workspaceId, requestId, cost_nanos: 1234, creditSnapshotBalanceNanos: null, createdAtMs: Date.now() });
const message = (id, body, attempts = 1) => ({ id, body, attempts, timestamp: new Date() });
async function eventually(check) {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (check()) return;
        await delay(20);
    }
    assert.ok(check(), "Local queue delivery must finish within two seconds");
}
let mf = runtime();
try {
    const body = record("lost-response");
    const first = await (await mf.getWorker("recovery")).queue("recovery", [message("transport-1", body)]);
    assert.deepEqual(first.explicitAcks, []);
    assert.deepEqual(first.retryMessages, [{ msgId: "transport-1", delaySeconds: 30 }]);
    assert.equal(ledger.size, 1);
    await mf.dispose();
    mf = runtime();
    const worker = await mf.getWorker("recovery");
    const replay = await worker.queue("recovery", [message("transport-2", body, 2), message("transport-3", body, 3)]);
    assert.deepEqual(replay.explicitAcks, ["transport-2", "transport-3"]);
    assert.deepEqual(replay.retryMessages, []);
    assert.equal(ledger.size, 1, "Fresh Worker and duplicate deliveries never add a second debit");
    assert.equal(chargeCalls.length, 3);
    const conflict = { ...body, cost_nanos: 9999 };
    const poison = { ...body, requestId: "invalid", cost_nanos: -1 };
    const failed = await worker.queue("recovery", [message("conflict", conflict, 5),
        message("invalid", poison), message("permanent", record("permanent"), 5)]);
    assert.deepEqual(failed.explicitAcks, ["conflict", "invalid", "permanent"]);
    await eventually(() => deadLetters.length === 3);
    assert.equal(chargeCalls.length, 5, "Invalid payload must not reach source");
    assert.equal(ledger.size, 1);
    assert.ok(deadLetters.some(value => value.cost_nanos === 9999));
    const input = { workspaceId, requestId: "producer", cost_nanos: 42, creditSnapshotBalanceNanos: null };
    const sent = await mf.dispatchFetch("https://local.invalid/", { method: "POST", body: JSON.stringify(input) });
    assert.deepEqual(await sent.json(), { queued: true });
    await eventually(() => ledger.size === 2);
    const wrong = await worker.queue("unrelated", [message("wrong", record("wrong"))]);
    assert.equal(wrong.retryBatch.retry, true);
    assert.equal(wrong.retryBatch.delaySeconds, 300);
    assert.equal(ledger.size, 2);
    const stalledBody = record("stalled-response");
    const timedOut = await worker.queue("recovery", [message("stalled", stalledBody)]);
    assert.deepEqual(timedOut.explicitAcks, [], "A five-second debit timeout must not acknowledge a committed-but-unknown result");
    assert.deepEqual(timedOut.retryMessages, [{ msgId: "stalled", delaySeconds: 30 }]);
    assert.equal(ledger.size, 3);
    await mf.dispose();
    mf = runtime();
    const recovered = await (await mf.getWorker("recovery")).queue("recovery", [message("stalled-replay", stalledBody, 2)]);
    assert.deepEqual(recovered.explicitAcks, ["stalled-replay"]);
    assert.equal(ledger.size, 3, "Restarted recovery preserves one debit after an actual transport timeout");
    const directInput = { workspaceId, requestId: "direct-handoff", cost_nanos: 99 };
    const direct = await mf.dispatchFetch("https://local.invalid/direct", { method: "POST", body: JSON.stringify(directInput) });
    assert.deepEqual(await direct.json(), { queued: true, recorded: false });
    await eventually(() => chargeCalls.filter(call => call.p_request_id === "direct-handoff").length === 4);
    assert.equal(ledger.size, 4, "Three timed-out attempts and actual queue recovery still have one debit");
    assert.equal(ledger.get(`${workspaceId}:direct-handoff`), 99);
    const ambiguousInput = { workspaceId, requestId: "accepted-unconfirmed", cost_nanos: 77, creditSnapshotBalanceNanos: null };
    const ambiguous = await mf.dispatchFetch("https://local.invalid/ambiguous-send", { method: "POST", body: JSON.stringify(ambiguousInput) });
    assert.deepEqual(await ambiguous.json(), { confirmed: false }, "Accepted send without timely confirmation must remain unknown");
    await eventually(() => ledger.has(`${workspaceId}:accepted-unconfirmed`));
    assert.equal(ledger.size, 5);
    await mf.dispose();
    mf = runtime();
    const duplicateSend = await mf.dispatchFetch("https://local.invalid/", { method: "POST", body: JSON.stringify(ambiguousInput) });
    assert.deepEqual(await duplicateSend.json(), { queued: true });
    await eventually(() => chargeCalls.filter(call => call.p_request_id === "accepted-unconfirmed").length === 2);
    assert.equal(ledger.size, 5, "Unknown queue confirmation followed by fresh-Worker replay never duplicates a debit");
    assert.equal(ledger.get(`${workspaceId}:accepted-unconfirmed`), 77);
    console.log(JSON.stringify({ result: "PASS", freshWorkerReplay: true, duplicateDebitPrevented: true,
        realQueueHandoff: true, nativeAcksAndRetries: true, actualTransportTimeout: true,
        directTimeoutRecovery: true, coalescedDirectFinalizers: 16,
        ambiguousQueueAcceptanceReplay: true,
        quarantined: deadLetters.length, providerCalls: 0 }));
} finally { await mf.dispose(); }
