import { describe, expect, it } from "vitest";
import {
    decodeWorkspaceRuntimeCache, isWorkspaceRuntimeFresh, workspaceRuntimeSchema,
    workspaceRuntimeSettingsSchema, WORKSPACE_RUNTIME_MAX_CACHE_BYTES,
} from "./workspaceRuntimeSnapshot";

const workspaceId = "10000000-0000-4000-8000-000000000001";
const otherWorkspace = "10000000-0000-4000-8000-000000000002";
const fixture = () => ({
    version: 1, workspaceId, checkedAtMs: 10_000, expiresAtMs: 70_000,
    configuredTier: null, billingMode: "wallet",
    settings: Object.fromEntries(Object.keys(workspaceRuntimeSettingsSchema.shape).map(key => [key, null])) as Record<string, unknown>,
    byok: { test: [{ provider_id: "test", id: "60000000-0000-4000-8000-000000000001",
        fingerprint_sha256: "test-fingerprint", key_version: 1, always_use: false }] },
});

describe("workspace runtime snapshot contract", () => {
    it("preserves nullable defaults and credential references without deriving admission", () => {
        expect(workspaceRuntimeSchema.parse(fixture())).toEqual(fixture());
        expect(decodeWorkspaceRuntimeCache(JSON.stringify(fixture()), workspaceId, 10_000)).toEqual(fixture());
    });
    it.each(["credit_ok", "balance_nanos", "key_limit_ok", "api_key", "wallet", "providers"])("rejects %s at the top level", key => {
        expect(workspaceRuntimeSchema.safeParse({ ...fixture(), [key]: {} }).success).toBe(false);
    });
    it.each(["enc_value", "key", "secret", "Authorization", "workspace_id"])("rejects unexpected BYOK field %s", key => {
        const value = fixture();
        Object.assign(value.byok.test[0], { [key]: "do-not-cache" });
        expect(workspaceRuntimeSchema.safeParse(value).success).toBe(false);
    });
    it("rejects unreviewed settings and non-scalar configuration", () => {
        const value = fixture();
        value.settings.gateway_plugins = { secret: "do-not-cache" };
        expect(workspaceRuntimeSchema.safeParse(value).success).toBe(false);
        delete value.settings.gateway_plugins;
        value.settings.routing_mode = { arbitrary: true };
        expect(workspaceRuntimeSchema.safeParse(value).success).toBe(false);
    });
    it("binds credential references to their provider and snapshots to a workspace", () => {
        const value = fixture();
        value.byok.test[0].provider_id = "other";
        expect(workspaceRuntimeSchema.safeParse(value).success).toBe(false);
        expect(decodeWorkspaceRuntimeCache(JSON.stringify(fixture()), otherWorkspace, 10_000)).toBeNull();
    });
    it.each([[0, 0], [10_000, 9_999], [10_000, 70_001], [-1, 50_000], [0, Infinity], [0.5, 60_000]])(
        "rejects invalid lease %s through %s", (checkedAtMs, expiresAtMs) => {
            expect(workspaceRuntimeSchema.safeParse({ ...fixture(), checkedAtMs, expiresAtMs }).success).toBe(false);
        },
    );
    it("does not re-age expired snapshots or accept a future source timestamp", () => {
        const snapshot = workspaceRuntimeSchema.parse(fixture());
        expect(isWorkspaceRuntimeFresh(snapshot, workspaceId, 10_000)).toBe(true);
        expect(isWorkspaceRuntimeFresh(snapshot, workspaceId, 69_999)).toBe(true);
        expect(isWorkspaceRuntimeFresh(snapshot, workspaceId, 70_000)).toBe(false);
        expect(isWorkspaceRuntimeFresh(snapshot, workspaceId, 9_949)).toBe(true);
        expect(isWorkspaceRuntimeFresh(snapshot, workspaceId, 9_000)).toBe(true);
        expect(isWorkspaceRuntimeFresh(snapshot, workspaceId, 8_999)).toBe(false);
        expect(decodeWorkspaceRuntimeCache(JSON.stringify(snapshot), workspaceId, 70_000)).toBeNull();
    });
    it.each(["{", "null", "[]", "true", "\"text\""])("treats malformed cache %s as a miss", raw => {
        expect(decodeWorkspaceRuntimeCache(raw, workspaceId, 10_000)).toBeNull();
    });
    it("bypasses caching rather than truncating oversized valid source settings", () => {
        const value = fixture();
        value.settings.auto_routing_allowed_patterns = ["x".repeat(WORKSPACE_RUNTIME_MAX_CACHE_BYTES)];
        expect(workspaceRuntimeSchema.safeParse(value).success).toBe(true);
        expect(decodeWorkspaceRuntimeCache(JSON.stringify(value), workspaceId, 10_000)).toBeNull();
    });
    it("returns independently owned nested data on each cache decode", () => {
        const raw = JSON.stringify(fixture());
        const first = decodeWorkspaceRuntimeCache(raw, workspaceId, 10_000)!;
        first.byok.test[0].always_use = true;
        first.settings.routing_mode = "price";
        expect(decodeWorkspaceRuntimeCache(raw, workspaceId, 10_000)).toEqual(fixture());
    });
});
