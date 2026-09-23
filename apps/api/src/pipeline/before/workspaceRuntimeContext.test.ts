import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { composeWorkspaceRuntime, workspaceTeamSettings } from "./workspaceRuntimeContext";
import { workspaceRuntimeSchema, workspaceRuntimeSettingsSchema } from "./workspaceRuntimeSnapshot";
import { splitContextForCache } from "./context.shared";
import type { GatewayContextData } from "./types";
const gate = vi.hoisted(() => vi.fn());
vi.mock("@/core/feature-flags", () => ({ isDataContributionAccessEnabled: gate }));
const workspaceId = "10000000-0000-4000-8000-000000000001";
function snapshot() {
    return workspaceRuntimeSchema.parse({ version: 1, workspaceId, checkedAtMs: Date.now(), expiresAtMs: Date.now() + 60_000,
        configuredTier: "enterprise", billingMode: "wallet",
        settings: Object.fromEntries(Object.keys(workspaceRuntimeSettingsSchema.shape).map(key => [key, null])),
        byok: { test: [{ provider_id: "test", id: "20000000-0000-4000-8000-000000000001", fingerprint_sha256: "hash", key_version: 3, always_use: true }] },
    });
}
function context(): GatewayContextData {
    return { workspaceId, key: { ok: false }, keyLimit: { ok: false }, credit: { ok: false }, pricing: {},
        providers: [{ providerId: "test", supportsEndpoint: true, baseWeight: 1, providerModelSlug: "model", byokMeta: [] }] };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1_000_000); gate.mockReset().mockResolvedValue(true); });
afterEach(() => vi.useRealTimers());
describe("independent workspace composition", () => {
    it("does not acquire admission authority from tier/settings and owns BYOK references", async () => {
        const source = snapshot(), value = context();
        const composed = await composeWorkspaceRuntime(value, source);
        expect(composed.key.ok).toBe(false); expect(composed.keyLimit.ok).toBe(false); expect(composed.credit.ok).toBe(false);
        expect(composed.providers[0].byokMeta[0]).toMatchObject({ fingerprintSha256: "hash", keyVersion: "3", alwaysUse: true, routingMode: "priority" });
        composed.providers[0].byokMeta[0].fingerprintSha256 = "changed";
        expect(source.byok.test[0].fingerprint_sha256).toBe("hash");
        expect(value.providers[0].byokMeta).toEqual([]);
    });
    it("removes credential material/settings from separated cache segments but preserves catalog expiry", async () => {
        const value = await composeWorkspaceRuntime(context(), snapshot());
        value.providers[0].byokMeta[0].key = "never-cache-plaintext";
        value.publicCatalogExpiresAt = Date.now() + 300_000;
        const parts = splitContextForCache(value, { separateWorkspace: true });
        const raw = JSON.stringify(parts);
        expect(raw).not.toContain("never-cache-plaintext"); expect(raw).not.toContain("fingerprintSha256");
        expect(parts.dynamic).not.toHaveProperty("teamSettings");
        expect(parts.static.publicCatalogExpiresAt).toBe(value.publicCatalogExpiresAt);
        expect(parts.static).not.toHaveProperty("workspaceRuntimeExpiresAt");
    });
    it("rejects cross-tenant and expired snapshots", async () => {
        await expect(composeWorkspaceRuntime({ ...context(), workspaceId: "different" }, snapshot())).rejects.toThrow("composition_expired");
        const stale = snapshot(); vi.setSystemTime(stale.expiresAtMs);
        await expect(composeWorkspaceRuntime(context(), stale)).rejects.toThrow("composition_expired");
    });
    it("rechecks expiry after an asynchronous consent gate", async () => {
        const source = snapshot(); source.settings.data_contribution_enabled = true;
        gate.mockImplementation(async () => { vi.setSystemTime(source.expiresAtMs); return true; });
        await expect(composeWorkspaceRuntime(context(), source)).rejects.toThrow("composition_expired");
    });
    it("preserves healing lock, privacy and contribution gating for both sources", async () => {
        gate.mockResolvedValue(false);
        const settings = await workspaceTeamSettings({ response_healing_enabled: false, response_healing_locked: true,
            response_healing_mode: "strict", data_contribution_enabled: true, privacy_zdr_only: true, cache_aware_routing_enabled: false }, "invoice", workspaceId);
        expect(settings).toMatchObject({ billingMode: "invoice", privacyZdrOnly: true, cacheAwareRoutingEnabled: false, dataContributionEnabled: false,
            defaultPlugins: [{ id: "response-healing", enabled: false, preventOverrides: true, config: { mode: "strict" } }] });
        await expect(workspaceTeamSettings({}, "invalid", workspaceId)).rejects.toThrow("billing_mode_invalid");
    });
});
