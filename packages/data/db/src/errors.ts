/**
 * A PostgREST feature @phaseo/db does not translate. Thrown inside the
 * translator and answered as HTTP 501 with `code: "PHASEO_DB_UNSUPPORTED"`
 * and the feature in `message`/`details`, so the caller gets an error result
 * (or a throw under `.throwOnError()`) instead of wrong data. A 501 rather
 * than a thrown fetch error, because postgrest-js retries thrown GET/HEAD
 * fetches with 1s/2s/4s back-off.
 */
export class UnsupportedFeatureError extends Error {
	readonly feature: string;
	constructor(feature: string, message?: string) {
		super(message ?? `@phaseo/db does not support the PostgREST feature: ${feature}`);
		this.name = "UnsupportedFeatureError";
		this.feature = feature;
	}
}

export type PostgrestErrorBody = {
	code: string;
	message: string;
	details: string | unknown[] | null;
	hint: string | null;
};

/** An error PostgREST itself would answer with (bad request, singular mismatch, ...). */
export class PostgrestRequestError extends Error {
	readonly status: number;
	readonly body: PostgrestErrorBody;
	constructor(status: number, body: PostgrestErrorBody) {
		super(body.message);
		this.name = "PostgrestRequestError";
		this.status = status;
		this.body = body;
	}
}

export function requestError(status: number, code: string, message: string, details: PostgrestErrorBody["details"] = null, hint: string | null = null) {
	return new PostgrestRequestError(status, { code, message, details, hint });
}

export function queryParamError(message: string, details: string) {
	return requestError(400, "PGRST100", message, details);
}

type DriverError = {
	code?: unknown;
	sqlState?: unknown;
	message?: unknown;
	detail?: unknown;
	hint?: unknown;
};

/** SQLSTATE of a driver error (pg, postgres.js and PGlite all expose `code`). */
export function sqlStateOf(error: unknown): string | null {
	if (!error || typeof error !== "object") return null;
	const e = error as DriverError;
	const code = typeof e.code === "string" ? e.code : typeof e.sqlState === "string" ? e.sqlState : null;
	return code && /^[0-9A-Z]{5}$/.test(code) ? code : null;
}

/** PostgREST's pgErrorStatus (v12.2), keyed by SQLSTATE. */
export function statusForSqlState(code: string, message: string, authenticated: boolean): number {
	if (code === "23503" || code === "23505") return 409;
	if (code === "25006") return 405;
	if (code === "21000") return message.includes("requires a WHERE clause") ? 400 : 500;
	if (code === "53400") return 500;
	if (code === "57P01") return 503;
	if (code === "P0001") return 400;
	if (code === "42883") return message.startsWith("function xmlagg(") ? 406 : 404;
	if (code === "42P01") return 404;
	if (code === "42P17") return 500;
	if (code === "42501") return authenticated ? 403 : 401;
	if (code.startsWith("PT")) {
		const n = Number(code.slice(2));
		return Number.isInteger(n) && n >= 100 && n <= 599 ? n : 500;
	}
	const prefix = code.slice(0, 2);
	switch (prefix) {
		case "08":
			return 503;
		case "09":
			return 500;
		case "0L":
		case "0P":
			return 403;
		case "25":
			return 500;
		case "28":
			return 403;
		case "2D":
		case "38":
		case "39":
		case "3B":
		case "40":
			return 500;
		case "53":
			return 503;
		case "54":
		case "55":
		case "57":
		case "58":
		case "F0":
		case "HV":
		case "XX":
			return 500;
		case "P0":
			return 500;
		default:
			return 400;
	}
}

/** Turn a driver error into the response PostgREST would have sent, or null if it is not a Postgres error. */
export function postgresErrorResponse(error: unknown, authenticated: boolean): { status: number; body: PostgrestErrorBody } | null {
	const code = sqlStateOf(error);
	if (!code) return null;
	const e = error as DriverError;
	const message = typeof e.message === "string" ? e.message : String(e.message ?? "");
	return {
		status: statusForSqlState(code, message, authenticated),
		body: {
			code,
			message,
			details: typeof e.detail === "string" && e.detail !== "" ? e.detail : null,
			hint: typeof e.hint === "string" && e.hint !== "" ? e.hint : null,
		},
	};
}
