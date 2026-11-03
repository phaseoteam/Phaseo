// Minimal Stripe REST client for the few calls the gateway makes.
// Why: the Stripe SDK is ~780 KiB in the Worker bundle, which every cold start parses, for four endpoints.
// How: plain fetch with the SDK's request conventions (form-encoded bodies, Stripe-Version, idempotency keys,
// retries on network errors / 409 / 5xx honouring Stripe-Should-Retry, 80 s timeout) and SDK-shaped errors.
// Types still come from the `stripe` package; type-only imports add nothing to the bundle.
import type Stripe from "stripe";

export const STRIPE_API_VERSION = "2026-04-22.dahlia";
const API_BASE = "https://api.stripe.com/v1";
const DEFAULT_TIMEOUT_MS = 80_000;
const DEFAULT_MAX_NETWORK_RETRIES = 2;

type Params = Record<string, unknown>;

export type StripeRestOptions = {
	apiVersion?: string;
	fetch?: typeof fetch;
	maxNetworkRetries?: number;
	timeoutMs?: number;
	/** Test hook; defaults to setTimeout. */
	sleep?: (ms: number) => Promise<void>;
};

export type StripeRestClient = {
	customers: {
		retrieve(id: string): Promise<Stripe.Customer | Stripe.DeletedCustomer>;
	};
	paymentMethods: {
		list(params: { customer: string; type?: string; limit?: number }): Promise<Stripe.ApiList<Stripe.PaymentMethod>>;
	};
	paymentIntents: {
		create(params: Params, options?: { idempotencyKey?: string }): Promise<Stripe.PaymentIntent>;
	};
};

/** Mirrors the fields of the SDK's StripeError that callers read. */
export class StripeApiError extends Error {
	readonly type: string;
	readonly code?: string;
	readonly decline_code?: string;
	readonly param?: string;
	readonly statusCode?: number;
	readonly requestId?: string;
	readonly payment_intent?: Stripe.PaymentIntent;
	readonly raw: Record<string, any>;

	constructor(raw: Record<string, any>, statusCode?: number, requestId?: string) {
		super(typeof raw.message === "string" && raw.message ? raw.message : `Stripe request failed (${statusCode ?? "network"})`);
		this.name = "StripeApiError";
		this.raw = raw;
		this.type = typeof raw.type === "string" ? raw.type : "api_error";
		this.code = raw.code;
		this.decline_code = raw.decline_code;
		this.param = raw.param;
		this.statusCode = statusCode;
		this.requestId = requestId;
		this.payment_intent = raw.payment_intent;
	}
}

/** Stripe's form encoding: nested keys as `a[b]`, arrays as `a[0]`, null as "" (unset), undefined omitted. */
export function encodeStripeForm(params: Params): string {
	const pairs: string[] = [];
	const add = (key: string, value: unknown) => {
		if (value === undefined) return;
		if (value === null) {
			pairs.push(`${encodeURIComponent(key)}=`);
		} else if (Array.isArray(value)) {
			value.forEach((item, i) => add(`${key}[${i}]`, item));
		} else if (value instanceof Date) {
			pairs.push(`${encodeURIComponent(key)}=${Math.floor(value.getTime() / 1000)}`);
		} else if (typeof value === "object") {
			for (const [k, v] of Object.entries(value as Params)) add(`${key}[${k}]`, v);
		} else {
			pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
		}
	};
	for (const [k, v] of Object.entries(params)) add(k, v);
	return pairs.join("&");
}

function shouldRetry(response: Response | null): boolean {
	if (!response) return true; // connection error or timeout
	const header = response.headers.get("stripe-should-retry");
	if (header === "true") return true;
	if (header === "false") return false;
	return response.status === 409 || response.status >= 500;
}

function retryDelayMs(attempt: number, response: Response | null): number {
	const retryAfter = Number(response?.headers.get("retry-after"));
	const base = Math.min(500 * 2 ** attempt, 5_000);
	const jittered = base * (0.5 + Math.random() / 2);
	return Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= 60 ? Math.max(jittered, retryAfter * 1000) : jittered;
}

export function createStripeRestClient(secretKey: string, options: StripeRestOptions = {}): StripeRestClient {
	if (!secretKey?.trim()) throw new Error("missing_stripe_secret_key");
	const doFetch = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
	const maxRetries = options.maxNetworkRetries ?? DEFAULT_MAX_NETWORK_RETRIES;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

	async function request<T>(method: "GET" | "POST", path: string, params: Params = {}, idempotencyKey?: string): Promise<T> {
		const form = encodeStripeForm(params);
		const url = method === "GET" && form ? `${API_BASE}${path}?${form}` : `${API_BASE}${path}`;
		const headers: Record<string, string> = {
			Authorization: `Bearer ${secretKey}`,
			"Stripe-Version": options.apiVersion ?? STRIPE_API_VERSION,
			Accept: "application/json",
		};
		if (method === "POST") {
			headers["Content-Type"] = "application/x-www-form-urlencoded";
			// Like the SDK: a POST that may be retried always carries an idempotency key.
			headers["Idempotency-Key"] = idempotencyKey ?? (maxRetries > 0 ? `stripe-node-retry-${crypto.randomUUID()}` : "");
			if (!headers["Idempotency-Key"]) delete headers["Idempotency-Key"];
		}

		for (let attempt = 0; ; attempt++) {
			let response: Response | null = null;
			let networkError: unknown = null;
			try {
				response = await doFetch(url, {
					method,
					headers,
					body: method === "POST" ? form : undefined,
					signal: AbortSignal.timeout(timeoutMs),
				});
			} catch (error) {
				networkError = error;
			}
			if (response?.ok) return (await response.json()) as T;
			if (attempt < maxRetries && shouldRetry(response)) {
				// Drain the body so the connection can be reused.
				await response?.body?.cancel().catch(() => {});
				await sleep(retryDelayMs(attempt, response));
				continue;
			}
			if (!response) {
				const message = networkError instanceof Error ? networkError.message : String(networkError);
				throw new StripeApiError({ type: "api_connection_error", message: `Stripe connection failed: ${message}` });
			}
			const body = (await response.json().catch(() => null)) as { error?: Record<string, any> } | null;
			throw new StripeApiError(body?.error ?? { type: "api_error" }, response.status, response.headers.get("request-id") ?? undefined);
		}
	}

	return {
		customers: {
			retrieve: (id) => request("GET", `/customers/${encodeURIComponent(id)}`),
		},
		paymentMethods: {
			list: (params) => request("GET", "/payment_methods", params),
		},
		paymentIntents: {
			create: (params, opts) => request("POST", "/payment_intents", params, opts?.idempotencyKey),
		},
	};
}
