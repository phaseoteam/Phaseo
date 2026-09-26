import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
    values: new Map<string, string>(), failVersion: false, from: vi.fn(),
    put: vi.fn(), keyVersion: vi.fn(), get: vi.fn(),
}));
vi.mock("@/runtime/env", () => ({
    getCache: () => ({
        get: state.get,
        put: state.put,
    }),
    getSupabaseAdmin: () => ({ from: state.from }),
    dispatchBackground: (promise: Promise<unknown>) => { void promise; },
}));
vi.mock("@/core/kv", () => ({ keyVersionToken: state.keyVersion }));

beforeEach(() => {
    vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-20T12:00:00Z"));
    state.values.clear(); state.failVersion = false;
    state.get.mockReset().mockImplementation(async (key: string) => {
        if (state.failVersion && key === marker) throw new Error("version unavailable");
        return state.values.get(key) ?? null;
    });
    state.from.mockReset().mockImplementation(() => { throw new Error("Unexpected source read"); });
    state.put.mockReset().mockImplementation(async (key: string, value: string) => { state.values.set(key, value); });
    state.keyVersion.mockReset().mockResolvedValue("v0");
});
afterEach(() => vi.useRealTimers());

const args = { workspaceId: "workspace-freshness", apiKeyId: "key-freshness" };
const marker = "gateway:workspace-policy-version:workspace-freshness";
const cache = "gateway:workspace-policy:v3:workspace-freshness:key-freshness:";
function snapshot(policy: unknown, version = "v0:v0", checkedAtMs = Date.now()) {
    return JSON.stringify({ ...args, version, checkedAtMs, expiresAtMs: checkedAtMs + 60_000, policy });
}
const restrictedSettings = {
    model_restriction_mode: "blocklist", model_restriction_model_ids: ["lab/restricted"],
};

function mockSource(errorTable?: string) {
    state.from.mockImplementation((table: string) => {
        const result = {
            data: table === "workspace_settings" ? restrictedSettings : null,
            error: table === errorTable ? { message: "source unavailable" } : null,
        };
        const query = {
            select: () => query, eq: () => query,
            maybeSingle: async () => result,
            then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
        };
        return query;
    });
}

describe("workspace policy freshness", () => {
    it("does not restore an old marker or permissions when a read finishes after a bump", async () => {
        const { buildWorkspacePolicy, fetchWorkspacePolicy, bumpWorkspacePolicyVersion } = await import("./workspacePolicy");
        state.values.set(marker, "0");
        state.values.set(`${cache}v0:v0`, snapshot(buildWorkspacePolicy({})));
        state.values.set(`${cache}v1:v0`, snapshot(buildWorkspacePolicy({ globalSettings: restrictedSettings }), "v1:v0"));
        let finish!: (value: string) => void;
        state.get.mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve; }));
        const oldRead = fetchWorkspacePolicy(args);
        await Promise.resolve();
        expect(await bumpWorkspacePolicyVersion(args.workspaceId)).toBe(1);
        mockSource();
        finish("0");
        expect((await oldRead).blockedApiModels).toContain("lab/restricted");
        expect((await fetchWorkspacePolicy(args)).blockedApiModels).toContain("lab/restricted");
    });

    it("bypasses cached permissions while publication is pending and after a failed bump", async () => {
        const { buildWorkspacePolicy, fetchWorkspacePolicy, bumpWorkspacePolicyVersion } = await import("./workspacePolicy");
        state.values.set(`${cache}v0:v0`, snapshot(buildWorkspacePolicy({})));
        await fetchWorkspacePolicy(args);
        let reject!: (error: Error) => void;
        state.put.mockImplementationOnce(() => new Promise((_resolve, no) => { reject = no; }));
        const bump = bumpWorkspacePolicyVersion(args.workspaceId);
        const failure = expect(bump).rejects.toThrow("publish failed");
        await Promise.resolve();
        mockSource();
        expect((await fetchWorkspacePolicy(args)).blockedApiModels).toContain("lab/restricted");
        reject(new Error("publish failed")); await failure;
        // Failure does not renew the old local lease. The next marker read must
        // really go to KV (global propagation remains a separate TTL policy).
        state.get.mockClear();
        await fetchWorkspacePolicy(args);
        expect(state.get).toHaveBeenCalledWith(marker, "text");
    });

    it.each(["unavailable", "malformed", "key-version"])("uses uncached source policy when the version is %s", async (failure) => {
        const { buildWorkspacePolicy, fetchWorkspacePolicy } = await import("./workspacePolicy");
        const permissive = buildWorkspacePolicy({ globalSettings: null, guardrails: [], dynamicRoute: null });
        const restricted = buildWorkspacePolicy({ globalSettings: restrictedSettings, guardrails: [], dynamicRoute: null });
        state.values.set(marker, "0");
        state.values.set(`${cache}v0:v0`, snapshot(permissive));
        state.values.set(`${cache}v1:v0`, snapshot(restricted, "v1:v0"));
        expect((await fetchWorkspacePolicy(args)).blockedApiModels ?? []).not.toContain("lab/restricted");
        // Leave the 5–6 second version window, but keep the old 30–36 second policy entry.
        vi.setSystemTime(Date.now() + 6_001);
        state.values.set(marker, "1");
        expect((await fetchWorkspacePolicy(args)).blockedApiModels).toContain("lab/restricted");
        vi.setSystemTime(Date.now() + 6_001);
        if (failure === "unavailable") state.failVersion = true;
        else if (failure === "key-version") state.keyVersion.mockRejectedValue(new Error("key version unavailable"));
        else state.values.set(marker, "invalid-version");
        mockSource();
        expect((await fetchWorkspacePolicy(args)).blockedApiModels).toContain("lab/restricted");
        expect(state.from).toHaveBeenCalledTimes(4);
        expect(state.put).not.toHaveBeenCalled();
        // Unknown-version source results must not be reused in L1 either.
        state.from.mockClear();
        expect((await fetchWorkspacePolicy(args)).blockedApiModels).toContain("lab/restricted");
        expect(state.from).toHaveBeenCalledTimes(4);
        expect(state.put).not.toHaveBeenCalled();
        state.failVersion = false;
        state.keyVersion.mockResolvedValue("v0");
        state.values.set(marker, "1");
        state.from.mockClear();
        expect((await fetchWorkspacePolicy(args)).blockedApiModels).toContain("lab/restricted");
        expect(state.from).not.toHaveBeenCalled();
    });

    it.each(["workspace_settings", "keys", "key_guardrails", "gateway_dynamic_route_keys"])(
        "rejects instead of returning cached permissions when %s cannot be read", async (table) => {
            const { buildWorkspacePolicy, fetchWorkspacePolicy } = await import("./workspacePolicy");
            state.values.set(`${cache}v0:v0`, snapshot(buildWorkspacePolicy({})));
            state.failVersion = true;
            mockSource(table);
            await expect(fetchWorkspacePolicy(args)).rejects.toThrow("source unavailable");
            expect(state.put).not.toHaveBeenCalled();
        },
    );

    it.each(["", " ", "-1", "1.5", "1e3", "NaN", "Infinity", "9007199254740992"])(
        "does not normalize invalid version %j to a cached version", async (raw) => {
            const { buildWorkspacePolicy, fetchWorkspacePolicy, bumpWorkspacePolicyVersion } = await import("./workspacePolicy");
            state.values.set(marker, raw);
            state.values.set(`${cache}v0:v0`, snapshot(buildWorkspacePolicy({})));
            mockSource();
            expect((await fetchWorkspacePolicy(args)).blockedApiModels).toContain("lab/restricted");
            expect(state.from).toHaveBeenCalledTimes(4);
            await expect(bumpWorkspacePolicyVersion(args.workspaceId)).rejects.toThrow("invalid_workspace_policy_version");
            expect(state.put).not.toHaveBeenCalled();
        },
    );

    it("does not reset the invalidation counter on a read failure", async () => {
        const { bumpWorkspacePolicyVersion } = await import("./workspacePolicy");
        state.failVersion = true;
        await expect(bumpWorkspacePolicyVersion(args.workspaceId)).rejects.toThrow("version unavailable");
        expect(state.put).not.toHaveBeenCalled();
    });

    it("keeps the normal initial-version warm path free of source reads and writes", async () => {
        const { buildWorkspacePolicy, fetchWorkspacePolicy } = await import("./workspacePolicy");
        state.values.set(`${cache}v0:v0`, snapshot(buildWorkspacePolicy({ globalSettings: restrictedSettings })));
        for (let i = 0; i < 30; i++) {
            expect((await fetchWorkspacePolicy(args)).blockedApiModels).toContain("lab/restricted");
        }
        expect(state.from).not.toHaveBeenCalled();
        expect(state.put).not.toHaveBeenCalled();
    });

    it("initializes and advances valid invalidation counters", async () => {
        const { bumpWorkspacePolicyVersion } = await import("./workspacePolicy");
        expect(await bumpWorkspacePolicyVersion(args.workspaceId)).toBe(1);
        expect(await bumpWorkspacePolicyVersion(args.workspaceId)).toBe(2);
        expect(state.values.get(marker)).toBe("2");
    });

    it("does not renew source age when an expired L1 entry is refilled from stale KV", async () => {
        const { buildWorkspacePolicy, fetchWorkspacePolicy } = await import("./workspacePolicy");
        const started = Date.now();
        state.values.set(`${cache}v0:v0`, snapshot(buildWorkspacePolicy({})));
        await fetchWorkspacePolicy(args);
        vi.setSystemTime(started + 59_000);
        await fetchWorkspacePolicy(args);
        mockSource();
        vi.setSystemTime(started + 60_001);
        expect((await fetchWorkspacePolicy(args)).blockedApiModels).toContain("lab/restricted");
        expect(state.from).toHaveBeenCalledTimes(4);
    });

    it.each(["legacy", "future", "workspace", "key", "version", "long-lease"])("rejects %s cache provenance", async kind => {
        const { buildWorkspacePolicy, fetchWorkspacePolicy } = await import("./workspacePolicy");
        const value = JSON.parse(snapshot(buildWorkspacePolicy({})));
        if (kind === "future") { value.checkedAtMs += 1000; value.expiresAtMs += 1000; }
        if (kind === "workspace") value.workspaceId = "another-workspace";
        if (kind === "key") value.apiKeyId = "another-key";
        if (kind === "version") value.version = "v4:v2";
        if (kind === "long-lease") value.expiresAtMs += 1;
        state.values.set(`${cache}v0:v0`, JSON.stringify(kind === "legacy" ? value.policy : value));
        mockSource();
        expect((await fetchWorkspacePolicy(args)).blockedApiModels).toContain("lab/restricted");
        expect(state.from).toHaveBeenCalledTimes(4);
    });

    it("coalesces source refills and returns isolated nested rule objects", async () => {
        const { fetchWorkspacePolicy } = await import("./workspacePolicy");
        mockSource();
        const values = await Promise.all(Array.from({ length: 32 }, () => fetchWorkspacePolicy(args)));
        expect(state.from).toHaveBeenCalledTimes(4); expect(state.put).toHaveBeenCalledTimes(1);
        expect(state.get.mock.calls.filter(([key]) => key === `${cache}v0:v0`)).toHaveLength(1);
        expect(state.get.mock.calls.filter(([key]) => key === marker)).toHaveLength(1);
        values[0].blockedApiModels!.push("local-only");
        state.get.mockClear(); state.from.mockClear(); state.put.mockClear();
        expect((await fetchWorkspacePolicy(args)).blockedApiModels).not.toContain("local-only");
        expect(state.get).not.toHaveBeenCalled(); expect(state.from).not.toHaveBeenCalled(); expect(state.put).not.toHaveBeenCalled();
    });

    it("fences a policy cache read overtaken by a local mutation", async () => {
        const { fetchWorkspacePolicy, buildWorkspacePolicy, bumpWorkspacePolicyVersion } = await import("./workspacePolicy");
        let finish!: (raw: string) => void;
        state.get.mockImplementation(async (key: string) => key === `${cache}v0:v0`
            ? new Promise<string>(resolve => { finish = resolve; }) : state.values.get(key) ?? null);
        const pending = fetchWorkspacePolicy(args);
        for (let i = 0; i < 20 && !finish; i++) await Promise.resolve();
        expect(finish).toBeTypeOf("function");
        await bumpWorkspacePolicyVersion(args.workspaceId); mockSource();
        finish(snapshot(buildWorkspacePolicy({})));
        expect((await pending).blockedApiModels).toContain("lab/restricted");
    });

    it("rejects a source read taking longer than the policy lease", async () => {
        const { fetchWorkspacePolicy } = await import("./workspacePolicy");
        mockSource();
        state.from.mockImplementationOnce(() => {
            const query = { select: () => query, eq: () => query, maybeSingle: async () => {
                vi.setSystemTime(Date.now() + 60_001);
                return { data: restrictedSettings, error: null };
            } };
            return query;
        });
        await expect(fetchWorkspacePolicy(args)).rejects.toThrow("workspace_policy_source_lease_expired");
        expect(state.put).not.toHaveBeenCalled();
    });

    it("bounds pending marker reads without queuing unlimited source work", async () => {
        const { fetchWorkspacePolicy } = await import("./workspacePolicy");
        const finish: Array<(raw: string | null) => void> = [];
        state.get.mockImplementation(() => new Promise<string | null>(resolve => { finish.push(resolve); }));
        mockSource();
        const pending = Array.from({ length: 32 }, (_, i) => fetchWorkspacePolicy({ ...args, workspaceId: `workspace-${i}` }));
        await Promise.resolve();
        await expect(fetchWorkspacePolicy({ ...args, workspaceId: "over-capacity" })).rejects.toThrow("Cache refill capacity exceeded");
        state.get.mockResolvedValue(null);
        for (const resolve of finish) resolve(null);
        await Promise.all(pending);
    });

    it("preserves large authoritative policies without caching them", async () => {
        const { fetchWorkspacePolicy } = await import("./workspacePolicy");
        const large = "m".repeat(120_001);
        state.from.mockImplementation((table: string) => {
            const result = { data: table === "workspace_settings"
                ? { model_restriction_mode: "blocklist", model_restriction_model_ids: [large] } : null, error: null };
            const query = { select: () => query, eq: () => query, maybeSingle: async () => result,
                then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve) };
            return query;
        });
        expect((await fetchWorkspacePolicy(args)).blockedApiModels).toEqual([large]);
        expect((await fetchWorkspacePolicy(args)).blockedApiModels).toEqual([large]);
        expect(state.from).toHaveBeenCalledTimes(8); expect(state.put).not.toHaveBeenCalled();
    });
});
