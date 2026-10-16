import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, dispatchMock } = vi.hoisted(() => ({ rpcMock: vi.fn(), dispatchMock: vi.fn() }));
vi.mock("@/runtime/env", () => ({
    dispatchBackground: dispatchMock,
    getBindingsIfConfigured: () => null,
    getSupabaseAdmin: () => ({ rpc: rpcMock }),
}));

import {
    modelSubstitutionHeader,
    noteModelSubstitutionServed,
    recordModelSubstitution,
    resetRecordedModelSubstitutions,
    parseModelSuccessorResolution,
    parseSuccessorRedirectPolicy,
    successorPriceAllowed,
    successorRedirectTarget,
    type ModelSuccessorResolution,
    workspaceSuccessorOverride,
    type SuccessorRedirectPolicy,
} from "./modelSuccessor";

const eligible: ModelSuccessorResolution = {
    model: "lab/old",
    replacementModel: "lab/new",
    unservedSince: "2026-10-01T00:00:00Z",
    target: "lab/new",
    chain: ["lab/new"],
    reason: "eligible",
    priceRatio: 1,
    priceComparable: true,
    workspaceOverride: false,
};
const on: SuccessorRedirectPolicy = { enabled: true, pricePolicy: "never", maxPriceIncreasePercent: 0, overrides: {} };

describe("model successor redirect", () => {
    it("parses the database resolution", () => {
        expect(parseModelSuccessorResolution({
            model: "lab/old", replacement_model: "lab/mid", unserved_since: "2026-10-01T00:00:00+00:00", target: "lab/new",
            chain: ["lab/mid", "lab/new", 3], reason: "eligible", price_ratio: "1.25", price_comparable: true,
        })).toEqual({
            model: "lab/old", replacementModel: "lab/mid", unservedSince: "2026-10-01T00:00:00+00:00", target: "lab/new",
            chain: ["lab/mid", "lab/new"], reason: "eligible", priceRatio: 1.25, priceComparable: true, workspaceOverride: false,
        });
        expect(parseModelSuccessorResolution(null)).toBeNull();
        expect(parseModelSuccessorResolution({ target: "lab/new" })).toBeNull();
    });

    it("reads workspace settings and stays off by default", () => {
        expect(parseSuccessorRedirectPolicy(null)).toEqual({ enabled: false, pricePolicy: "never", maxPriceIncreasePercent: 0, overrides: {} });
        expect(parseSuccessorRedirectPolicy({
            model_successor_redirect_enabled: true, model_successor_price_policy: "limit", model_successor_max_price_increase_percent: 25,
        }, [{ model_slug: "lab/old", successor_model_slug: "lab/custom" }, { model_slug: "lab/keep", successor_model_slug: null }, { successor_model_slug: "x" }]))
            .toEqual({ enabled: true, pricePolicy: "limit", maxPriceIncreasePercent: 25, overrides: { "lab/old": "lab/custom", "lab/keep": null } });
        expect(parseSuccessorRedirectPolicy({ model_successor_redirect_enabled: "true", model_successor_price_policy: "other" }))
            .toEqual({ enabled: false, pricePolicy: "never", maxPriceIncreasePercent: 0, overrides: {} });
    });

    it.each([
        ["never", 0, 1, true],
        ["never", 0, 0.5, true],
        ["never", 0, 1.01, false],
        ["limit", 25, 1.25, true],
        ["limit", 25, 1.26, false],
        ["any", 0, 9, true],
    ] as const)("applies the %s price policy (limit %s%%) to ratio %s", (pricePolicy, percent, ratio, allowed) => {
        expect(successorPriceAllowed({ ...eligible, priceRatio: ratio }, { enabled: true, pricePolicy, maxPriceIncreasePercent: percent, overrides: {} }))
            .toBe(allowed);
    });

    it("only allows an unknown price under the any policy", () => {
        const unknown = { ...eligible, priceRatio: null, priceComparable: false };
        expect(successorPriceAllowed(unknown, { ...on, pricePolicy: "limit", maxPriceIncreasePercent: 1000 })).toBe(false);
        expect(successorPriceAllowed(unknown, { ...on, pricePolicy: "any" })).toBe(true);
    });

    it("redirects only eligible models for workspaces that turned it on", () => {
        expect(successorRedirectTarget(eligible, on)).toEqual({
            from: "lab/old", to: "lab/new", reason: "unserved", chain: ["lab/new"], unservedSince: "2026-10-01T00:00:00Z", priceRatio: 1, source: "approved",
        });
        expect(successorRedirectTarget(eligible, { ...on, enabled: false })).toBeNull();
        expect(successorRedirectTarget({ ...eligible, reason: "free_to_paid", target: null }, on)).toBeNull();
        expect(successorRedirectTarget({ ...eligible, reason: "within_grace_period" }, on)).toBeNull();
        expect(successorRedirectTarget(null, on)).toBeNull();
    });

    it("uses the workspace's own replacement whatever it costs", () => {
        const custom = { ...eligible, target: "lab/custom", chain: ["lab/custom"], priceRatio: null, priceComparable: false, workspaceOverride: true };
        expect(successorRedirectTarget(custom, on)).toMatchObject({ to: "lab/custom", source: "workspace" });
        expect(workspaceSuccessorOverride({ ...on, overrides: { "lab/old": null } }, "lab/old")).toBeNull();
        expect(workspaceSuccessorOverride(on, "lab/old")).toBeUndefined();
    });

    it("describes the substitution in one header", () => {
        expect(modelSubstitutionHeader(successorRedirectTarget(eligible, on)!)).toBe("reason=unserved; from=lab/old; to=lab/new");
    });
});

describe("model substitution notice", () => {
    const substitution = successorRedirectTarget(eligible, on)!;

    beforeEach(() => {
        rpcMock.mockReset();
        resetRecordedModelSubstitutions();
    });

    it("records each substitution once per isolate", async () => {
        rpcMock.mockResolvedValue({ data: true, error: null });
        await recordModelSubstitution("ws_1", substitution);
        expect(recordModelSubstitution("ws_1", substitution)).toBeNull();
        expect(rpcMock).toHaveBeenCalledTimes(1);
        expect(rpcMock).toHaveBeenCalledWith("record_model_substitution", {
            p_workspace_id: "ws_1", p_model_slug: "lab/old", p_successor_slug: "lab/new", p_source: "approved",
        });

        await recordModelSubstitution("ws_2", { ...substitution, source: "workspace" });
        expect(rpcMock).toHaveBeenLastCalledWith("record_model_substitution", expect.objectContaining({ p_workspace_id: "ws_2", p_source: "workspace" }));
    });

    it("tries again after a failed call, and skips requests without a workspace", async () => {
        rpcMock.mockResolvedValueOnce({ data: null, error: { message: "timeout" } }).mockResolvedValueOnce({ data: true, error: null });
        await expect(recordModelSubstitution("ws_1", substitution)).rejects.toThrow("model_substitution_record_failed:timeout");
        await recordModelSubstitution("ws_1", substitution);
        expect(rpcMock).toHaveBeenCalledTimes(2);
        expect(recordModelSubstitution(null, substitution)).toBeNull();
    });

    it("notes served substitutions in the background, never in testing mode", async () => {
        resetRecordedModelSubstitutions();
        dispatchMock.mockClear();
        rpcMock.mockResolvedValue({ error: null });
        const modelSubstitution = { ...substitution, from: "lab/x" };
        noteModelSubstitutionServed({ routingDiagnostics: { modelSubstitution }, workspaceId: "ws_9", testingMode: true });
        noteModelSubstitutionServed({ routingDiagnostics: {}, workspaceId: "ws_9" });
        expect(dispatchMock).not.toHaveBeenCalled();
        noteModelSubstitutionServed({ routingDiagnostics: { modelSubstitution }, workspaceId: "ws_9" });
        expect(dispatchMock).toHaveBeenCalledTimes(1);
        await dispatchMock.mock.calls[0]?.[0];
    });

    it("keeps slugs containing ':' apart", async () => {
        resetRecordedModelSubstitutions();
        rpcMock.mockResolvedValue({ error: null });
        await recordModelSubstitution("ws_1", { ...substitution, from: "lab/a:lab/b", to: "lab/c" });
        expect(recordModelSubstitution("ws_1", { ...substitution, from: "lab/a", to: "lab/b:lab/c" })).not.toBeNull();
    });
});
