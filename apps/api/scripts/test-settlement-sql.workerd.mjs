import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { PGlite } from "@electric-sql/pglite";

const require = createRequire(import.meta.url), wrangler = createRequire(require.resolve("wrangler/package.json"));
const { build } = wrangler("esbuild"), { Miniflare } = wrangler("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const db = new PGlite();
const owner = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const missing = "10000000-0000-4000-8000-000000000003";
const deadLetters = [];
let lostResponse = false;
const migration = name => readFile(new URL(`../../../supabase/migrations/${name}.sql`, import.meta.url), "utf8");
function functionSql(sql, name) {
    const marker = `create or replace function public.${name}(`;
    const start = sql.indexOf(marker), end = sql.indexOf("$$;", start);
    assert.ok(start >= 0 && end > start, `Missing authoritative function ${name}`);
    return sql.slice(start, end + 3);
}
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false,
    external: ["cloudflare:*", "node:*"], stdin: { resolveDir: root, loader: "ts", contents: `
        import { handleSettlementRecoveryBatch } from './src/core/settlement-recovery';
        export default { queue: handleSettlementRecoveryBatch };
    ` } });
async function source(request) {
    const url = new URL(request.url);
    if (url.hostname === "dead-letter.invalid") {
        deadLetters.push(...await request.json());
        return new Response(null, { status: 204 });
    }
    assert.equal(url.hostname, "source.invalid", "No provider, payment or other outbound calls");
    if (url.pathname === "/rest/v1/workspace_settings") return Response.json(null);
    assert.equal(url.pathname, "/rest/v1/rpc/gateway_charge_with_credit_cache");
    const input = await request.json();
    let result;
    try {
        result = await db.transaction(async tx => {
            await tx.exec("set local role service_role");
            return (await tx.query("select public.gateway_charge_with_credit_cache($1,$2,$3,$4) as result",
                [input.p_workspace_id, input.p_request_id, input.p_cost_nanos, input.p_credit_snapshot_balance_nanos])).rows[0].result;
        });
    } catch (error) { return Response.json({ message: error.message }, { status: 409 }); }
    if (input.p_request_id === "lost-response" && !lostResponse) {
        lostResponse = true; // The SQL transaction has committed before this transport failure.
        return Response.json({ message: "fixture response loss" }, { status: 504 });
    }
    return Response.json(result);
}
function runtime() {
    return new Miniflare({ workers: [{ name: "recovery",
        modules: [{ type: "ESModule", path: "recovery.mjs", contents: bundle.outputFiles[0].text }],
        compatibilityDate: "2025-10-01", compatibilityFlags: ["nodejs_compat"], kvNamespaces: ["GATEWAY_CACHE"],
        bindings: { SUPABASE_URL: "https://source.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture",
            GATEWAY_SETTLEMENT_RECOVERY_ENABLED: "true", GATEWAY_SETTLEMENT_RECOVERY_QUEUE_NAME: "recovery" },
        queueProducers: { SETTLEMENT_RECOVERY_DEAD_LETTER: "dead-letter" }, outboundService: source,
    }, { name: "quarantine", compatibilityDate: "2025-10-01",
        modules: [{ type: "ESModule", path: "quarantine.mjs", contents: `export default {
            async queue(batch) { await fetch('https://dead-letter.invalid/', { method: 'POST', body: JSON.stringify(batch.messages.map(m => m.body)) }); }
        };` }], queueConsumers: { "dead-letter": { maxBatchSize: 1, maxBatchTimeout: 0 } }, outboundService: source,
    }] });
}
const record = (requestId, workspaceId = owner, cost_nanos = 100) => ({ version: 1, workspaceId, requestId,
    cost_nanos, creditSnapshotBalanceNanos: null, createdAtMs: Date.now() });
const message = (id, body, attempts = 1) => ({ id, body, attempts, timestamp: new Date() });
const balance = async workspace => (await db.query("select balance_nanos,reserved_nanos from wallets where workspace_id=$1", [workspace])).rows[0];
const charges = async () => (await db.query("select workspace_id,request_id,cost_nanos,status from gateway_request_charges order by workspace_id,request_id")).rows;
let mf;
try {
    await db.exec(await readFile(new URL("../../../supabase/tests/fixtures/credit-headroom-before.sql", import.meta.url), "utf8"));
    // Use repository migrations verbatim, not a JS reimplementation of the ledger.
    await db.exec(functionSql(await migration("20260423223000_fix_gateway_charge_rpcs_workspace_params"), "gateway_deduct_and_check_top_up_once"));
    await db.exec(functionSql(await migration("20260723124000_batch_billing_security_invariants"), "deduct_and_check_top_up"));
    await db.exec(await migration("20260916144808_gateway_credit_cache_headroom"));
    await db.query("insert into wallets(workspace_id,balance_nanos,reserved_nanos) values ($1,10000,9500),($2,10000,0)", [owner, other]);
    mf = runtime();
    const body = record("lost-response");
    const initial = await (await mf.getWorker("recovery")).queue("recovery", [message("first", body)]);
    assert.deepEqual(initial.explicitAcks, []);
    assert.deepEqual(initial.retryMessages, [{ msgId: "first", delaySeconds: 30 }]);
    assert.deepEqual(await balance(owner), { balance_nanos: 9900, reserved_nanos: 9500 });
    await mf.dispose(); mf = runtime();
    const worker = await mf.getWorker("recovery");
    const replay = await worker.queue("recovery", [message("replay", body, 2), message("duplicate", body, 3)]);
    assert.deepEqual(replay.explicitAcks, ["replay", "duplicate"]);
    assert.deepEqual(await balance(owner), { balance_nanos: 9900, reserved_nanos: 9500 });
    assert.equal((await charges()).length, 1);
    const independent = await worker.queue("recovery", [message("other", record("lost-response", other))]);
    assert.deepEqual(independent.explicitAcks, ["other"]);
    assert.deepEqual(await balance(other), { balance_nanos: 9900, reserved_nanos: 0 });
    const denied = await worker.queue("recovery", [message("conflict", { ...body, cost_nanos: 101 }, 5),
        message("held", record("held-funds", owner, 401), 5)]);
    assert.deepEqual(denied.explicitAcks, ["conflict", "held"]); // Confirmed quarantine, not settled.
    assert.deepEqual(await balance(owner), { balance_nanos: 9900, reserved_nanos: 9500 });
    assert.equal((await charges()).length, 2, "Failed debit transaction must roll back its applying record");
    const absent = record("missing-wallet", missing);
    const unavailable = await worker.queue("recovery", [message("missing", absent)]);
    assert.deepEqual(unavailable.explicitAcks, [], "A missing wallet must not count as settled even if the legacy wrapper marks applied");
    assert.deepEqual(unavailable.retryMessages, [{ msgId: "missing", delaySeconds: 30 }]);
    const exhausted = await worker.queue("recovery", [message("missing-final", absent, 5)]);
    assert.deepEqual(exhausted.explicitAcks, ["missing-final"]);
    for (let i = 0; i < 100 && deadLetters.length !== 3; i++) await delay(20);
    assert.equal(deadLetters.length, 3);
    assert.deepEqual(deadLetters.map(row => row.requestId).sort(), ["held-funds", "lost-response", "missing-wallet"]);
    assert.equal(await balance(missing), undefined);
    console.log(JSON.stringify({ result: "PASS", actualSqlFunctions: true, commitResponseLossRestartReplay: true,
        amountConflictQuarantined: true, heldFundsPreserved: true, workspaceIdentityIsolated: true,
        missingWalletNotSettled: true, externalCalls: 0, concurrency: "PGlite serializes SQL; not a lock-contention test" }));
} finally { await mf?.dispose(); await db.close(); }
