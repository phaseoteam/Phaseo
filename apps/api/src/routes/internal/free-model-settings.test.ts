import { beforeEach, describe, expect, it, vi } from "vitest";
import { freeQuotaSettings, initialFreeQuota } from "@/core/free-model-quota";

const { actor } = vi.hoisted(() => ({ actor: vi.fn() }));
vi.mock("@/lib/oauth/service", () => ({ getSupabaseActor: actor }));
import { internalFreeModelSettingsRoutes as routes } from "./free-model-settings";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const settings = freeQuotaSettings(initialFreeQuota(0), 0);
const getSettings = vi.fn();
const setOverage = vi.fn();
const getByName = vi.fn();
const limit = vi.fn();
const env = { SUPABASE_URL: "https://source.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture", GATEWAY_CACHE: {},
    GATEWAY_FREE_MODEL_QUOTA_ENABLED: "true", GATEWAY_FREE_MODEL_OVERAGE_ENABLED: "false", FREE_MODEL_QUOTA: { getByName }, FREE_MODEL_RATE_LIMITER: { limit } };
const execution = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };

function request(method = "GET", body?: unknown, headers: Record<string, string> = {}, bindings = env) {
    return routes.request("/", { method, headers: { authorization: "Bearer session", "content-type": "application/json", ...headers },
        ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) }, bindings as never, execution as never);
}

beforeEach(() => {
    vi.clearAllMocks();
    actor.mockResolvedValue({ userId: owner });
    getSettings.mockResolvedValue(settings);
    setOverage.mockResolvedValue({ updated: true, settings });
    getByName.mockReturnValue({ getSettings, setOverage });
    limit.mockResolvedValue({ success: true });
});

describe("owner free-model settings", () => {
    it("enables explicitly consented overage only when deployed, with a version fence", async () => {
        const active = { ...env, GATEWAY_FREE_MODEL_OVERAGE_ENABLED: "true" };
        expect(await (await request("GET", undefined, {}, active)).json()).toMatchObject({ data: { overageAvailable: true } });
        const result = await request("PATCH", { allowOverage: true, expectedVersion: 2 }, {}, active);
        expect(result.status).toBe(200);
        expect(setOverage).toHaveBeenCalledWith(true, 2);
    });
    it("is unavailable with the feature disabled and does not touch auth/storage", async () => {
        expect((await request("GET", undefined, {}, { ...env, GATEWAY_FREE_MODEL_QUOTA_ENABLED: "false" })).status).toBe(404);
        expect(actor).not.toHaveBeenCalled();
        expect(getByName).not.toHaveBeenCalled();
    });

    it("requires a verified personal session; management keys and unverified identity fail", async () => {
        expect((await request("GET", undefined, { authorization: "" })).status).toBe(401);
        actor.mockResolvedValueOnce(null).mockResolvedValueOnce({ userId: "not-a-user" });
        expect((await request("GET", undefined, { authorization: "Bearer management-key" })).status).toBe(401);
        expect((await request()).status).toBe(401);
        expect(getByName).not.toHaveBeenCalled();
    });

    it("ignores workspace/owner headers and returns uncached authoritative state", async () => {
        const response = await request("GET", undefined, { "x-phaseo-workspace-id": other, "x-owner-id": other });
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(response.headers.get("vary")).toBe("Authorization");
        expect(getByName).toHaveBeenCalledExactlyOnceWith(`owner:${owner}`);
        expect(limit).toHaveBeenCalledWith({ key: `settings:${owner}` });
        expect(await response.json()).toEqual({ data: { ...settings, overageAvailable: false } });
        actor.mockResolvedValue({ userId: other });
        await request();
        expect(getByName).toHaveBeenLastCalledWith(`owner:${other}`);
        expect(getSettings).toHaveBeenCalledTimes(2);
    });

    it("confirms disable only after persistence and returns the new policy version", async () => {
        let finish!: (value: unknown) => void;
        setOverage.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
        let completed = false;
        const pending = request("PATCH", { allowOverage: false, expectedVersion: 8 }).then(response => { completed = true; return response; });
        await vi.waitFor(() => expect(setOverage).toHaveBeenCalledWith(false, 8));
        expect(completed).toBe(false);
        finish({ updated: true, settings: { ...settings, policyVersion: 9 } });
        expect(await (await pending).json()).toMatchObject({ data: { allowOverage: false, policyVersion: 9 } });
    });

    it("returns conflict and current state for stale tabs without retrying", async () => {
        setOverage.mockResolvedValue({ updated: false, settings: { ...settings, policyVersion: 9 } });
        const response = await request("PATCH", { allowOverage: false, expectedVersion: 8 });
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ error: "policy_version_conflict", data: { policyVersion: 9 } });
        expect(setOverage).toHaveBeenCalledOnce();
    });

    it("does not permit enable before financial recovery is implemented", async () => {
        const response = await request("PATCH", { allowOverage: true, expectedVersion: 0 });
        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: "free_model_overage_not_available" });
        expect(setOverage).not.toHaveBeenCalled();
    });

    it.each([{}, [], null, "{", { allowOverage: false }, { allowOverage: false, expectedVersion: -1 },
        { allowOverage: false, expectedVersion: 0.5 }, { allowOverage: false, expectedVersion: 0, ownerId: other }].map(body => ({ body })))("rejects invalid or targeted mutations: $body", async ({ body }) => {
        expect((await request("PATCH", body)).status).toBe(400);
        expect(setOverage).not.toHaveBeenCalled();
    });

    it("caps streamed request bodies before parsing", async () => {
        expect((await request("PATCH", " ".repeat(513))).status).toBe(413);
        expect(actor).not.toHaveBeenCalled();
        expect(setOverage).not.toHaveBeenCalled();
    });

    it("rejects edge abuse without a coordinator RPC", async () => {
        limit.mockResolvedValue({ success: false });
        const response = await request();
        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBe("60");
        expect(getByName).not.toHaveBeenCalled();
        expect(actor).not.toHaveBeenCalled();
    });

    it("separates ingress abuse from the owner's settings budget", async () => {
        limit.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false });
        const response = await request("GET", undefined, { "cf-connecting-ip": "203.0.113.2" });
        expect(response.status).toBe(429);
        expect(limit).toHaveBeenNthCalledWith(1, { key: "settings-auth:203.0.113.2" });
        expect(limit).toHaveBeenNthCalledWith(2, { key: `settings:${owner}` });
        expect(actor).toHaveBeenCalledOnce();
        expect(getByName).not.toHaveBeenCalled();
    });

    it("does not retry or leak details on ambiguous mutation failure", async () => {
        setOverage.mockRejectedValue(new Error("secret internal diagnostic"));
        const response = await request("PATCH", { allowOverage: false, expectedVersion: 0 });
        expect(response.status).toBe(503);
        expect(await response.text()).not.toContain("secret");
        expect(setOverage).toHaveBeenCalledOnce();
    });
});
