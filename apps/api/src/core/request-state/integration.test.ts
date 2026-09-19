import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { configureRuntime, clearRuntime, type GatewayBindings } from "@/runtime/env";
import { withoutSupabase } from "@/runtime/request-state-scope";
import { authenticate, hashRequestStateSecret } from "@/pipeline/before/auth";
import { fetchGatewayContext } from "@/pipeline/before/context";
import { fetchWorkspacePolicy } from "@/pipeline/before/workspacePolicy";
import { reserveWalletCredits, settleWalletReservation, releaseWalletReservation, captureWalletReservation } from "@core/wallet-reservations";
import { recordUsageAndCharge } from "@/pipeline/pricing/persist";
import { digest, resetSnapshotMemoryForTests, sealSnapshot } from "./snapshots";
import type { CompiledRequestSnapshot } from "./contracts";

const workspaceId = "staging:integration";
const kid = "edge123456789012";
const keyId = "key-id";
const token = `phaseo_v1_sk_${kid}_secret`;
const internal = "x".repeat(128);
const encryptionKey = btoa("k".repeat(32));
const gate = { ok: true, reason: null, resetAt: null };

describe("published request-state API boundaries", () => {
    let key: { id: string; kid: string; workspace_id: string; status: string; hash: string; soft_blocked: boolean; expires_at: null };
    let stub: Record<string, ReturnType<typeof vi.fn>>;

    beforeEach(async () => {
        resetSnapshotMemoryForTests();
        key = { id: keyId, kid, workspace_id: workspaceId, status: "active", hash: await hashRequestStateSecret("secret", "pepper"),
            soft_blocked: false, expires_at: null };
        const value = { version: 1, workspaceId, apiKeyId: keyId, model: "model", endpoint: "text.generate", testingMode: false,
            validUntil: Date.now() + 60_000, policy: { activeGuardrailIds: ["private-policy"] },
            context: { workspaceId, providers: [], pricing: {}, key: gate, keyLimit: gate, credit: { ...gate, balanceNanos: 999_000_000_000 } },
        } as unknown as CompiledRequestSnapshot;
        const raw = await sealSnapshot(value, encryptionKey);
        const ref = { key: "snapshot", digest: await digest(raw), validUntil: value.validUntil, revision: 1 };
        const result = { applied: true, alreadyApplied: false, status: "captured", amountNanos: 100,
            beforeBalanceNanos: 1000, afterBalanceNanos: 900, beforeReservedNanos: 100, afterReservedNanos: 0 };
        stub = {
            key: vi.fn(async () => key),
            preflight: vi.fn(async () => ({ reference: ref, wallet: { balanceNanos: 4_000_000_000, reservedNanos: 1_000_000_000 } })),
            policy: vi.fn(async () => ref), blob: vi.fn(async () => raw),
            reserve: vi.fn(async () => ({ ...result, status: "held" })),
            settle: vi.fn(async () => result), capture: vi.fn(async () => result),
            release: vi.fn(async () => ({ ...result, status: "released" })), charge: vi.fn(async () => result),
        };
        const kv = { get: vi.fn(async (name: string) => name.startsWith("directory:") ? workspaceId : raw) };
        configureRuntime({ ENV: "staging", GATEWAY_REQUEST_STATE_MODE: "synthetic",
            SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "unused-test-service-key",
            KEY_PEPPER_ACTIVE: "pepper", GATEWAY_INTERNAL_TEST_TOKEN: internal,
            GATEWAY_REQUEST_STATE_ENCRYPTION_KEY: encryptionKey,
            GATEWAY_CACHE: kv, GATEWAY_REQUEST_STATE_KV: kv,
            WORKSPACE_REQUEST_STATE: { getByName: () => stub },
        } as unknown as GatewayBindings);
        vi.stubGlobal("fetch", vi.fn(() => { throw new Error("unexpected_network"); }));
    });
    afterEach(() => { clearRuntime(); vi.unstubAllGlobals(); });

    function request(value = token, privileged = true) {
        return new Request("https://gateway.test/v1/responses", { headers: {
            Authorization: `Bearer ${value}`, ...(privileged ? { "x-internal-token": internal } : {}),
        } });
    }

    it("validates HMAC and current durable key state without bypassing normal guards", async () => {
        const first = await withoutSupabase(() => authenticate(request()));
        expect(first).toMatchObject({ attempts: 0, value: { ok: true, workspaceId, apiKeyId: keyId, internal: false } });
        expect(await authenticate(request(token.replace("secret", "wrong")))).toMatchObject({ ok: false, reason: "invalid_secret" });
        key.status = "revoked";
        expect(await authenticate(request())).toMatchObject({ ok: false, reason: "key_not_found_or_revoked" });
        expect(fetch).not.toHaveBeenCalled();
    });

    it("rejects unprivileged synthetic keys before querying any state", async () => {
        expect(await authenticate(request(token, false))).toMatchObject({ ok: false, reason: "synthetic_key_requires_internal_token" });
        expect(stub.key).not.toHaveBeenCalled();
    });

    it("loads real context/policy entrypoints and replaces a snapshot balance with current durable credit", async () => {
        const result = await withoutSupabase(async () => {
            const context = await fetchGatewayContext({ workspaceId, apiKeyId: keyId, model: "model", endpoint: "text.generate" });
            const policy = await fetchWorkspacePolicy({ workspaceId, apiKeyId: keyId });
            return { context, policy };
        });
        expect(result.attempts).toBe(0);
        expect(result.value.context.credit.balanceNanos).toBe(3_000_000_000);
        expect(result.value.policy.activeGuardrailIds).toEqual(["private-policy"]);
        expect(fetch).not.toHaveBeenCalled();
    });

    it("uses the existing billing helpers for ordinary inference and all hold transitions", async () => {
        const result = await withoutSupabase(async () => {
            const identity = { workspaceId, keyId, reservationId: "video-job" };
            await reserveWalletCredits({ ...identity, amountNanos: 500 });
            await settleWalletReservation({ ...identity, actualNanos: 100 });
            await captureWalletReservation(identity);
            await releaseWalletReservation(identity);
            await recordUsageAndCharge({ workspaceId, requestId: "text-request", cost_nanos: 100 });
        });
        expect(result.attempts).toBe(0);
        expect(stub.reserve).toHaveBeenCalledWith({ id: "video-job", keyId, kind: "hold", amountNanos: 500, requestCount: 1 });
        expect(stub.charge).toHaveBeenCalledWith("text-request", 100);
        expect(fetch).not.toHaveBeenCalled();
    });
});
