import { AsyncLocalStorage } from "node:async_hooks";

// Request-local diagnostic enforcement. A concurrent publisher can still read
// Supabase while a preflight benchmark proves it has no database dependency.
const scope = new AsyncLocalStorage<{ attempts: number }>();

export async function withoutSupabase<T>(operation: () => Promise<T>): Promise<{ value: T; attempts: number }> {
    const state = { attempts: 0 };
    const value = await scope.run(state, operation);
    return { value, attempts: state.attempts };
}

export function assertSupabaseAllowed(): void {
    const state = scope.getStore();
    if (!state) return;
    state.attempts++;
    throw new Error("supabase_forbidden_on_request_path");
}
