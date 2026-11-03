/**
 * A `fetch` implementation for @supabase/postgrest-js that answers each
 * PostgREST HTTP request by running SQL instead of calling a server.
 */
import { postgresErrorResponse, PostgrestRequestError, requestError, UnsupportedFeatureError } from "../errors";
import type { SqlExecutor } from "../executor";
import type { RelationshipMetadata } from "../relationships";
import { type QueryTags, tagStatement } from "../tags";
import { type CompatRequest, type CompatResponse, type Method, parsePrefer, type QueryKind, statusText, translate, type Translation } from "./translate";

export type QueryEvent = {
	app: string | null;
	route: string | null;
	table: string;
	kind: QueryKind;
	/** Rows returned to the app (or affected, for minimal-return mutations). */
	rows: number;
	/** UTF-8 byte length of the JSON body handed back to the app (0 for errors, HEAD, 204). */
	bytes: number;
	ms: number;
	status: number;
	/** PostgREST / SQLSTATE error code when the request failed. */
	error?: string;
};

/** Runs a translated statement, applying role/claims setup when needed. */
export type SessionRunner = <T>(request: { method: Method; path: string; kind: QueryKind; table: string; transactional: boolean }, fn: (exec: SqlExecutor) => Promise<T>) => Promise<T>;

export type CompatFetchOptions = {
	meta: RelationshipMetadata;
	maxRows: number | null;
	schemas: string[];
	tags: QueryTags;
	authenticated: boolean;
	run: SessionRunner;
	onQuery?: (event: QueryEvent) => void;
	/** Called with every statement (after tagging); for tests and debugging. */
	onStatement?: (sql: string, params: readonly unknown[]) => void;
	/** Called when a request uses a PostgREST feature @phaseo/db does not translate. */
	onUnsupported?: (error: UnsupportedFeatureError) => void;
};

/** `error.code` of the 501 answer for an untranslated PostgREST feature. */
export const UNSUPPORTED_CODE = "PHASEO_DB_UNSUPPORTED";

/** UTF-8 length without allocating an encoded copy. */
export function utf8ByteLength(text: string): number {
	let bytes = 0;
	for (let i = 0; i < text.length; i++) {
		const c = text.charCodeAt(i);
		if (c < 0x80) bytes += 1;
		else if (c < 0x800) bytes += 2;
		else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
			const next = text.charCodeAt(i + 1);
			if (next >= 0xdc00 && next <= 0xdfff) {
				bytes += 4;
				i++;
			} else bytes += 3;
		} else bytes += 3;
	}
	return bytes;
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

function headerOf(headers: Record<string, string>, name: string): string | null {
	const lower = name.toLowerCase();
	for (const k of Object.keys(headers)) if (k.toLowerCase() === lower) return headers[k]!;
	return null;
}

function toHeaderRecord(init: HeadersInit | undefined): Record<string, string> {
	const out: Record<string, string> = {};
	if (!init) return out;
	if (typeof Headers !== "undefined" && init instanceof Headers) {
		init.forEach((v, k) => (out[k] = v));
		return out;
	}
	if (Array.isArray(init)) {
		for (const [k, v] of init) out[k] = v;
		return out;
	}
	return { ...(init as Record<string, string>) };
}

export function parseCompatRequest(url: URL, method: string, headers: Record<string, string>, body: string | null, schemas: string[]): CompatRequest {
	const m = method.toUpperCase();
	if (m !== "GET" && m !== "HEAD" && m !== "POST" && m !== "PATCH" && m !== "DELETE") {
		throw requestError(405, "PGRST117", `Unsupported HTTP method: ${m}`, null, null);
	}
	const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
	let rpc = false;
	let target: string;
	if (segments.length === 2 && segments[0] === "rpc") {
		rpc = true;
		target = segments[1]!;
	} else if (segments.length === 1) target = segments[0]!;
	else throw requestError(404, "PGRST125", `Invalid path specified in request URL`, null, null);

	const profile = headerOf(headers, m === "GET" || m === "HEAD" ? "accept-profile" : "content-profile");
	const schema = profile ?? schemas[0]!;
	if (!schemas.includes(schema)) throw requestError(406, "PGRST106", `The schema must be one of the following: ${schemas.join(", ")}`, null, null);

	const accept = (headerOf(headers, "accept") ?? "application/json").toLowerCase();
	let singular = false;
	let stripNulls = false;
	const mediaTypes = accept.split(",").map((s) => s.trim());
	const primary = mediaTypes[0] ?? "";
	if (primary.startsWith("application/vnd.pgrst.object+json")) {
		singular = true;
		stripNulls = /nulls=stripped/.test(primary);
	} else if (primary.startsWith("application/vnd.pgrst.array+json")) {
		stripNulls = /nulls=stripped/.test(primary);
	} else if (primary.startsWith("text/csv")) throw new UnsupportedFeatureError("csv() (Accept: text/csv)");
	else if (primary.startsWith("application/geo+json")) throw new UnsupportedFeatureError("geojson() (Accept: application/geo+json)");
	else if (primary.startsWith("application/vnd.pgrst.plan")) throw new UnsupportedFeatureError("explain() (Accept: application/vnd.pgrst.plan)");
	else if (!(primary.startsWith("application/json") || primary.startsWith("*/*") || primary === "")) {
		throw requestError(406, "PGRST107", `None of these media types are available: ${accept}`, null, null);
	}

	const params: Array<[string, string]> = [...url.searchParams.entries()];
	const range = headerOf(headers, "range");
	if (range) {
		const rm = /^(\d+)-(\d*)$/.exec(range.trim());
		if (!rm) throw requestError(416, "PGRST103", "Requested range not satisfiable", "The lower boundary must be lower than or equal to the upper boundary in the Range header.", null);
		const lower = Number(rm[1]);
		if (!params.some(([k]) => k === "offset")) params.push(["offset", String(lower)]);
		if (rm[2] && !params.some(([k]) => k === "limit")) params.push(["limit", String(Number(rm[2]) - lower + 1)]);
	}
	return { method: m, schema, target, rpc, params, prefer: parsePrefer(headerOf(headers, "prefer")), singular, stripNulls, body };
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status, statusText: statusText(status), headers: { "content-type": "application/json; charset=utf-8" } });
}

/**
 * Reject as soon as `signal` aborts, like fetch does, so `.abortSignal(AbortSignal.timeout(ms))`
 * still bounds the caller's wait. The statement itself is not cancelled; it
 * finishes (or fails) on its connection and its result is dropped.
 */
function abortable<T>(work: Promise<T>, signal: AbortSignal | null | undefined, reason: () => unknown): Promise<T> {
	if (!signal) return work;
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(reason());
		signal.addEventListener("abort", onAbort, { once: true });
		work.then(
			(v) => {
				signal.removeEventListener("abort", onAbort);
				resolve(v);
			},
			(e) => {
				signal.removeEventListener("abort", onAbort);
				reject(e);
			},
		);
	});
}

/** Build the fetch function handed to PostgrestClient. */
export function createCompatFetch(options: CompatFetchOptions): typeof fetch {
	const compatFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const started = now();
		const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
		const method = (init?.method ?? "GET").toUpperCase();
		const headers = toHeaderRecord(init?.headers);
		const body = typeof init?.body === "string" ? init.body : init?.body == null ? null : String(init.body);
		const signal = init?.signal;
		const abortReason = () => signal?.reason ?? new DOMException("The operation was aborted.", "AbortError");
		if (signal?.aborted) throw abortReason();

		let translation: Translation | null = null;
		let req: CompatRequest | null = null;
		const report = (status: number, rows: number, bytes: number, error?: string) => {
			if (!options.onQuery) return;
			try {
				options.onQuery({
					app: (options.tags.app as string | undefined) ?? null,
					route: (options.tags.route as string | undefined) ?? null,
					table: translation?.table ?? req?.target ?? url.pathname.split("/").pop() ?? "",
					kind: translation?.kind ?? (req?.rpc ? "rpc" : "select"),
					rows,
					bytes,
					ms: now() - started,
					status,
					...(error ? { error } : {}),
				});
			} catch {
				// A metrics hook must never break a query.
			}
		};

		try {
			req = parseCompatRequest(url, method, headers, body, options.schemas);
			const t = translate(req, { meta: options.meta, maxRows: options.maxRows });
			translation = t;
			const tags = { ...options.tags, table: t.table };
			const sql = tagStatement(t.sql, tags);
			options.onStatement?.(sql, t.params);
			const running = options.run(
				{ method: req.method, path: url.pathname, kind: t.kind, table: t.table, transactional: t.needsTransaction },
				async (exec) => {
					const rows = await exec.query(sql, t.params);
					return t.finish(rows[0]);
				},
			);
			const result: CompatResponse = await abortable(running, signal, abortReason);
			const resBody = result.status === 204 ? null : result.body;
			report(result.status, result.rows, resBody ? utf8ByteLength(resBody) : 0);
			return new Response(resBody, { status: result.status, statusText: statusText(result.status), headers: result.headers });
		} catch (error) {
			if (error instanceof PostgrestRequestError) {
				report(error.status, 0, 0, error.body.code);
				return jsonResponse(error.status, error.body);
			}
			const pg = postgresErrorResponse(error, options.authenticated);
			if (pg) {
				report(pg.status, 0, 0, pg.body.code);
				return jsonResponse(pg.status, pg.body);
			}
			if (error instanceof UnsupportedFeatureError) {
				// A response, not a throw: postgrest-js retries thrown GET/HEAD fetches
				// three times with back-off, and a 501 keeps a stable error code.
				report(501, 0, 0, UNSUPPORTED_CODE);
				options.onUnsupported?.(error);
				return jsonResponse(501, { code: UNSUPPORTED_CODE, message: error.message, details: error.feature, hint: "Rewrite this query as SQL or an RPC, or add the feature to @phaseo/db." });
			}
			report(0, 0, 0, signal?.aborted && error === signal.reason ? "ABORTED" : "CLIENT_ERROR");
			throw error;
		}
	};
	return compatFetch as typeof fetch;
}
