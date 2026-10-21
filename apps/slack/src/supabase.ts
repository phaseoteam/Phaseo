import type { Env } from "./env";

// The few PostgREST calls the Worker makes, with the service role. Kept to plain
// fetch so the Worker stays small and tests can hand in a fake fetch. Errors
// carry PostgREST's code only, never a response body.

const TIMEOUT_MS = 8_000;

export type Db = {
	/** GET /rest/v1/<table>?<query>. Filters use PostgREST syntax, e.g. { status: "neq.uninstalled" }. */
	select<T>(table: string, query: Record<string, string>): Promise<T[]>;
	insert(table: string, row: Record<string, unknown>): Promise<void>;
	/** PATCH with filters; returns the updated rows. */
	update<T>(table: string, filters: Record<string, string>, values: Record<string, unknown>, columns: string): Promise<T[]>;
	rpc<T>(fn: string, args: Record<string, unknown>): Promise<T>;
};

export class DbError extends Error {
	constructor(readonly status: number, readonly code: string | null) {
		super(`db_error_${status}${code ? `_${code}` : ""}`);
	}
}

export function createDb(env: Pick<Env, "SUPABASE_URL" | "SUPABASE_SERVICE_ROLE_KEY">, fetchImpl: typeof fetch = fetch): Db {
	const base = env.SUPABASE_URL?.trim().replace(/\/+$/, "");
	const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
	const request = async (path: string, init: RequestInit & { prefer?: string }): Promise<Response> => {
		if (!base || !key) throw new DbError(0, "unconfigured");
		const headers: Record<string, string> = {
			apikey: key,
			Authorization: `Bearer ${key}`,
			Accept: "application/json",
		};
		if (init.body !== undefined) headers["Content-Type"] = "application/json";
		if (init.prefer) headers.Prefer = init.prefer;
		const response = await fetchImpl(`${base}/rest/v1/${path}`, { ...init, headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
		if (!response.ok) {
			const body = await response.json().catch(() => null) as { code?: unknown } | null;
			throw new DbError(response.status, typeof body?.code === "string" ? body.code.slice(0, 20) : null);
		}
		return response;
	};
	return {
		async select<T>(table: string, query: Record<string, string>) {
			const response = await request(`${table}?${new URLSearchParams(query)}`, { method: "GET" });
			return await response.json() as T[];
		},
		async insert(table: string, row: Record<string, unknown>) {
			await request(table, { method: "POST", body: JSON.stringify(row), prefer: "return=minimal" });
		},
		async update<T>(table: string, filters: Record<string, string>, values: Record<string, unknown>, columns: string) {
			const response = await request(`${table}?${new URLSearchParams({ ...filters, select: columns })}`, {
				method: "PATCH",
				body: JSON.stringify(values),
				prefer: "return=representation",
			});
			return await response.json() as T[];
		},
		async rpc<T>(fn: string, args: Record<string, unknown>) {
			const response = await request(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });
			const text = await response.text();
			return (text ? JSON.parse(text) : null) as T;
		},
	};
}
