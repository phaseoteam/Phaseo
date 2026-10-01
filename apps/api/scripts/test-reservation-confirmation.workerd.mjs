import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

const require = createRequire(import.meta.url), wrangler = createRequire(require.resolve("wrangler/package.json"));
const { build } = wrangler("esbuild"), { Miniflare } = wrangler("miniflare");
const root = fileURLToPath(new URL("../", import.meta.url));
const db = new PGlite();
const workspace = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
let corruptNextResponse = true;
const calls = [];
const bundle = await build({ absWorkingDir: root, bundle: true, format: "esm", platform: "browser", write: false,
    external: ["cloudflare:*", "node:*"], stdin: { resolveDir: root, loader: "ts", contents: `
        import { configureRuntime, clearRuntime } from './src/runtime/env';
        import { captureWalletReservation, releaseWalletReservation } from './src/core/wallet-reservations';
        export default { async fetch(request, env) {
            configureRuntime(env);
            try {
                const input = await request.json();
                const operation = new URL(request.url).pathname === '/release' ? releaseWalletReservation : captureWalletReservation;
                return Response.json(await operation(input));
            } catch (error) { return Response.json({ error: error.message }, { status: 503 }); }
            finally { clearRuntime(); }
        } };
    ` } });
async function source(request) {
    const url = new URL(request.url);
    assert.equal(url.hostname, "source.invalid", "No external provider/payment calls");
    const operation = url.pathname.split("/").at(-1);
    assert.ok(["gateway_wallet_capture_once", "gateway_wallet_release_once"].includes(operation));
    calls.push(operation);
    const input = await request.json();
    const data = await db.transaction(async tx => {
        await tx.exec("set local role service_role");
        return (await tx.query(`select * from public.${operation}($1,$2,$3)`,
            [input.p_workspace_id, input.p_reservation_id, input.p_capture_ref_id ?? input.p_release_ref_id])).rows;
    });
    if (corruptNextResponse) {
        corruptNextResponse = false;
        return Response.json([]); // Commit succeeded; only its confirmation is corrupted.
    }
    return Response.json(data);
}
function runtime() {
    return new Miniflare({ modules: [{ type: "ESModule", path: "reservation.mjs", contents: bundle.outputFiles[0].text }],
        compatibilityDate: "2025-10-01", compatibilityFlags: ["nodejs_compat"], kvNamespaces: ["GATEWAY_CACHE"],
        bindings: { SUPABASE_URL: "https://source.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture" }, outboundService: source });
}
const balance = async id => (await db.query("select balance_nanos,reserved_nanos from wallets where workspace_id=$1", [id])).rows[0];
let mf;
try {
    // Minimal synthetic schema; execute the repository's actual financial functions unchanged.
    await db.exec(`create role anon; create role authenticated; create role service_role;
        create table wallets(workspace_id uuid primary key, balance_nanos bigint, reserved_nanos bigint, updated_at timestamptz);
        create table gateway_wallet_reservations(workspace_id uuid, reservation_id text, amount_nanos bigint, status text,
            settled_amount_nanos bigint, captured_nanos bigint, released_nanos bigint, capture_ref_id text, release_ref_id text,
            captured_at timestamptz, released_at timestamptz, updated_at timestamptz, primary key(workspace_id,reservation_id));
        create table credit_ledger(workspace_id uuid, kind text, amount_nanos bigint, before_balance_nanos bigint,
            after_balance_nanos bigint, before_reserved_nanos bigint, after_reserved_nanos bigint,
            ref_type text, ref_id text, source_ref_type text, source_ref_id text, status text);
    `);
    const migration = await readFile(new URL("../../../supabase/migrations/20260906162500_async_reservation_replay.sql", import.meta.url), "utf8");
    const end = migration.indexOf("CREATE OR REPLACE FUNCTION public.gateway_wallet_settle_once(");
    assert.ok(end > 0);
    await db.exec(migration.slice(0, end));
    await db.query("insert into wallets values($1,1000000,100000,null),($2,1000000,100000,null)", [workspace, other]);
    await db.query(`insert into gateway_wallet_reservations(workspace_id,reservation_id,amount_nanos,status)
        values($1,'video_hold:confirmation',100000,'reserved'),($2,'video_hold:confirmation',100000,'held')`, [workspace, other]);
    mf = runtime();
    const input = { workspaceId: workspace, reservationId: "video_hold:confirmation", captureRefId: "video" };
    const send = (path, body) => mf.dispatchFetch(`https://worker.invalid/${path}`, { method: "POST", body: JSON.stringify(body) });
    const ambiguous = await send("capture", input);
    assert.equal(ambiguous.status, 503, "Committed-but-unconfirmed capture must not become an unknown/absent reservation");
    assert.deepEqual(await ambiguous.json(), { error: "wallet_reservation_confirmation_invalid" });
    assert.deepEqual(await balance(workspace), { balance_nanos: 900000, reserved_nanos: 0 });
    await mf.dispose(); mf = runtime();
    for (let i = 0; i < 2; i++) {
        const replay = await send("capture", input);
        assert.equal(replay.status, 200);
        assert.deepEqual(await replay.json(), { status: "captured", applied: false, alreadyApplied: true, amountNanos: 100000,
            beforeBalanceNanos: 900000, afterBalanceNanos: 900000, beforeReservedNanos: 0, afterReservedNanos: 0 });
    }
    const crossWorkspace = await send("release", { ...input, workspaceId: other });
    assert.equal((await crossWorkspace.json()).status, "released");
    assert.deepEqual(await balance(other), { balance_nanos: 1000000, reserved_nanos: 0 });
    const terminal = await send("capture", { ...input, workspaceId: other });
    assert.equal((await terminal.json()).status, "reservation_not_active");
    const absent = await send("capture", { ...input, reservationId: "video_hold:absent" });
    assert.equal((await absent.json()).status, "not_found");
    assert.deepEqual(await balance(workspace), { balance_nanos: 900000, reserved_nanos: 0 });
    assert.deepEqual((await db.query("select workspace_id,amount_nanos from credit_ledger")).rows,
        [{ workspace_id: workspace, amount_nanos: -100000 }]);
    assert.equal(calls.length, 6, "No implicit retries or alternative billing RPCs");
    console.log(JSON.stringify({ result: "PASS", actualSqlCapture: true, commitCorruptConfirmationRestartReplay: true,
        ledgerDebits: 1, workspaceIsolation: true, externalCalls: 0,
        limits: "Local PGlite/Workers; not live database or concurrent-lock evidence" }));
} finally { await mf?.dispose(); await db.close(); }
