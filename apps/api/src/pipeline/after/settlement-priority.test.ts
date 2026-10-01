import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ charge: vi.fn(), tokens: vi.fn(), audit: vi.fn(), cache: vi.fn(), sticky: vi.fn(), release: vi.fn(), tasks: [] as Promise<unknown>[] }));
vi.mock("./charge", () => ({ recordUsageAndChargeOnce: mocks.charge }));
vi.mock("@core/provider-rate-limits", () => ({ recordManagedProviderTokensOnce: mocks.tokens }));
vi.mock("./audit", () => ({ handleSuccessAudit: mocks.audit, handleFailureAudit: vi.fn() }));
vi.mock("./guards", () => ({ guardUpstreamStatus: async () => ({ ok: true }) }));
vi.mock("./pricing", () => ({ loadProviderPricing: async () => null, calculatePricing: (usage: unknown) => ({ pricedUsage: usage, totalCents: 1, totalNanos: 10000000, currency: "USD" }) }));
vi.mock("./payload", async original => ({ ...await original<typeof import("./payload")>(),
    enrichSuccessPayload: async (_ctx: unknown, result: any) => result.normalized,
    formatClientPayload: ({ payload }: any) => payload,
}));
vi.mock("@/plugins/registry", () => ({ applyResponsePlugins: async ({ payload }: any) => ({ payload, executions: [] }) }));
vi.mock("../execute/sticky-routing", () => ({ maybeWriteStickyRoutingFromUsage: mocks.sticky, resolveCacheAwareRoutingPreference: () => true }));
vi.mock("@/runtime/env", () => ({ ensureRuntimeForBackground: () => mocks.release,
    getResponseCache: () => ({ set: mocks.cache }), dispatchBackground: (task: Promise<unknown>) => { mocks.tasks.push(task); void task.catch(() => {}); },
}));
import { finalizeRequest } from "./index";

beforeEach(() => {
    vi.clearAllMocks(); mocks.tasks.length = 0;
    for (const mock of [mocks.charge, mocks.tokens, mocks.audit, mocks.cache, mocks.sticky]) mock.mockReset().mockResolvedValue(undefined);
});
async function run() {
    const ctx: any = { endpoint: "chat.completions", protocol: "openai.chat.completions", workspaceId: "workspace", requestId: "public", billingRequestId: "billing",
        model: "fixture/model", stream: false, body: {}, meta: {}, timer: { span: (_name: string, fn: () => unknown) => fn() },
        responseCache: { enabled: true, status: "miss", key: "cache-key", fingerprint: "fingerprint", ttlSeconds: 60 } };
    const result: any = { provider: "fixture", upstream: new Response("{}"), normalized: {
        id: "response", choices: [{ message: { role: "assistant", content: "hello" }, finish_reason: "stop" }],
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    }, bill: { cost_cents: 1, currency: "USD", usage: null } };
    return finalizeRequest({ pre: { ctx }, exec: { result } } as any);
}

it.each(["cache", "sticky"] as const)("settles and audits before an optional %s write can stall", async target => {
    let release!: () => void;
    mocks[target].mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
    try {
        const response = await run();
        expect(response.status).toBe(200);
        await vi.waitFor(() => expect(mocks[target]).toHaveBeenCalledOnce());
        expect(mocks.charge).toHaveBeenCalledOnce();
        expect(mocks.tokens).toHaveBeenCalledOnce();
        expect(mocks.audit).toHaveBeenCalledOnce();
        expect(mocks.release).not.toHaveBeenCalled();
    } finally { release?.(); await Promise.allSettled(mocks.tasks); }
    expect(mocks.cache).toHaveBeenCalledOnce(); expect(mocks.sticky).toHaveBeenCalledOnce();
    expect(mocks.release).toHaveBeenCalledOnce();
});

it("keeps the buffered response independent of a pending debit", async () => {
    let release!: () => void;
    mocks.charge.mockImplementation(() => new Promise<void>(resolve => { release = resolve; }));
    const response = await run();
    expect(response.status).toBe(200);
    expect(mocks.cache).not.toHaveBeenCalled(); expect(mocks.sticky).not.toHaveBeenCalled();
    release(); await Promise.all(mocks.tasks);
    expect(mocks.audit).toHaveBeenCalledOnce(); expect(mocks.cache).toHaveBeenCalledOnce();
});

it.each(["cache", "sticky"] as const)("optional %s failures leave completed accounting intact", async target => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks[target].mockRejectedValue(new Error("advisory unavailable"));
    try {
        expect((await run()).status).toBe(200);
        await Promise.all(mocks.tasks);
        for (const mock of [mocks.charge, mocks.tokens, mocks.audit, mocks.cache, mocks.sticky, mocks.release]) expect(mock).toHaveBeenCalledOnce();
    } finally { warning.mockRestore(); }
});

it("releases the runtime and skips optional hints if mandatory finalization rejects", async () => {
    mocks.charge.mockRejectedValue(new Error("settlement_identity_conflict"));
    expect((await run()).status).toBe(200);
    await expect(mocks.tasks[0]).rejects.toThrow("settlement_identity_conflict");
    expect(mocks.tokens).not.toHaveBeenCalled(); expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.cache).not.toHaveBeenCalled(); expect(mocks.sticky).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledOnce();
});
