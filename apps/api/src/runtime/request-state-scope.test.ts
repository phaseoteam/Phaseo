import { expect, it } from "vitest";
import { assertSupabaseAllowed, withoutSupabase } from "./request-state-scope";

it("rejects database access even when callers catch the error", async () => {
    const result = await withoutSupabase(async () => {
        await Promise.resolve();
        try { assertSupabaseAllowed(); } catch { /* A fallback must remain visible. */ }
        return "caught";
    });
    expect(result).toEqual({ value: "caught", attempts: 1 });
});

it("does not block a concurrent control-plane request or leak after completion", async () => {
    let unblock!: () => void;
    const wait = new Promise<void>(resolve => { unblock = resolve; });
    const protectedRequest = withoutSupabase(async () => {
        await wait;
        expect(() => assertSupabaseAllowed()).toThrow("supabase_forbidden_on_request_path");
    });
    expect(() => assertSupabaseAllowed()).not.toThrow();
    unblock();
    expect((await protectedRequest).attempts).toBe(1);
    expect(() => assertSupabaseAllowed()).not.toThrow();
});
