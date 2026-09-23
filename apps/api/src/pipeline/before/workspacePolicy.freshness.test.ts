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
const cache = "gateway:workspace-policy:v2:workspace-freshness:key-freshness:";
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
        state.values.set(`${cache}v0:v0`, JSON.stringify(buildWorkspacePolicy({})));
        state.values.set(`${cache}v1:v0`, JSON.stringify(buildWorkspacePolicy({ globalSettings: restrictedSettings })));
        let finish!: (value: string) => void;
        state.get.mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve; }));
        const oldRead = fetchWorkspacePolicy(args);
        expect(await bumpWorkspacePolicyVersion(args.workspaceId)).toBe(1);
        mockSource();
        finish("0");
        expect((await oldRead).blockedApiModels).toContain("lab/restricted");
        expect((await fetchWorkspacePolicy(args)).blockedApiModels).toContain("lab/restricted");
    });

    it("bypasses cached permissions while publication is pending and after a failed bump", async () => {
        const { buildWorkspacePolicy, fetchWorkspacePolicy, bumpWorkspacePolicyVersion } = await import("./workspacePolicy");
        state.values.set(`${cache}v0:v0`, JSON.stringify(buildWorkspacePolicy({})));
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
        state.values.set(`${cache}v0:v0`, JSON.stringify(permissive));
        state.values.set(`${cache}v1:v0`, JSON.stringify(restricted));
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
            state.values.set(`${cache}v0:v0`, JSON.stringify(buildWorkspacePolicy({})));
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
            state.values.set(`${cache}v0:v0`, JSON.stringify(buildWorkspacePolicy({})));
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
        state.values.set(`${cache}v0:v0`, JSON.stringify(buildWorkspacePolicy({ globalSettings: restrictedSettings })));
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
});
