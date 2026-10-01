import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { authServingCacheStats, readAuthKey, rememberAuthKey, rememberValidatedAuth, resetAuthServingCaches } from "./auth-cache";
import { coalesceKeyLastUsed, keyLastUsedStats, resetKeyLastUsedForTests } from "./auth-last-used";

beforeEach(() => { resetAuthServingCaches(); resetKeyLastUsedForTests(); });
afterEach(() => { vi.useRealTimers(); });
const row = () => ({ id: "test", workspace_id: "workspace", status: "active", hash: "a".repeat(64), auth_source_at_ms: Date.now() });

it("bounds retained auth rows and validated decisions by count and bytes", () => {
    for (let index = 0; index < 2500; index++) {
        rememberAuthKey(`kid${index}`, "v0", row());
        rememberValidatedAuth(`digest${index}`, "v0", row(), { ok: true, workspaceId: "workspace", apiKeyId: "id", apiKeyKid: "kid", apiKeyRef: "ref" });
    }
    const stats = authServingCacheStats();
    expect(stats.rows.entries).toBeLessThanOrEqual(2000); expect(stats.rows.bytes).toBeLessThanOrEqual(4 * 1024 * 1024);
    expect(stats.validated.entries).toBeLessThanOrEqual(2000); expect(stats.validated.bytes).toBeLessThanOrEqual(1024 * 1024);
    expect(stats.rows.evictions).toBeGreaterThan(0); expect(stats.validated.evictions).toBeGreaterThan(0);
});

it("projects required fields, clones per reader and refuses oversized private metadata", async () => {
    const source = { ...row(), unrelated_private_column: "do-not-cache" };
    expect(rememberAuthKey("kid", "v0", source)).not.toContain("do-not-cache");
    const first = await readAuthKey("kid", "v0", vi.fn()); first!.status = "deleted";
    expect((await readAuthKey("kid", "v0", vi.fn()))!.status).toBe("active");
    expect(rememberAuthKey("large", "v0", { ...row(), scopes: "x".repeat(20_000) })).toBeNull();
});

it("does not retain negative lookups", async () => {
    const load = vi.fn(async () => null);
    expect(await readAuthKey("kid", "v0", load)).toBeNull();
    expect(await readAuthKey("kid", "v0", load)).toBeNull();
    expect(load).toHaveBeenCalledTimes(2); expect(authServingCacheStats().rows.entries).toBe(0);
});

it("bounds advisory last-used writes in flight", async () => {
    const releases: Array<() => void> = [];
    const tasks = Array.from({ length: 100 }, (_, index) => coalesceKeyLastUsed(`id${index}`, () => new Promise<void>(resolve => releases.push(resolve))));
    await Promise.resolve();
    expect(tasks.filter(Boolean)).toHaveLength(32); expect(keyLastUsedStats().active).toBe(32);
    releases.forEach(release => release()); await Promise.all(tasks);
    expect(keyLastUsedStats().active).toBe(0);
});

it("a late failed timestamp write cannot evict a newer coalescing window", async () => {
    vi.useFakeTimers(); const now = Date.now(); let reject!: () => void;
    const old = coalesceKeyLastUsed("key", () => new Promise<void>((_resolve, fail) => { reject = () => fail(new Error("old")); }));
    await Promise.resolve(); vi.setSystemTime(now + 60_001);
    await coalesceKeyLastUsed("key", async () => {}); reject(); await old;
    expect(coalesceKeyLastUsed("key", async () => {})).toBeNull();
});
