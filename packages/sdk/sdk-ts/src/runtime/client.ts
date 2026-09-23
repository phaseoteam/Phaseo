import { createTransport, requestTraceUrl, trackResponse, type RequestControls } from "./transport.js";

export type RequestOptions = RequestControls & {
	method: string;
	path: string;
	query?: Record<string, string | number | boolean | Array<string | number | boolean>>;
	headers?: Record<string, string>;
	body?: unknown;
};

export type ClientOptions = RequestControls & {
	baseUrl: string;
	headers?: Record<string, string>;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
};

export type RawResponse<T> = {
	data: T;
	status: number;
	headers: Headers;
	requestId?: string;
	traceUrl?: string;
};

export type PhaseoGatewayErrorBody = {
	code?: unknown;
	error?: unknown;
	request_id?: unknown;
	generation_id?: unknown;
	status_code?: unknown;
	error_type?: unknown;
	error_origin?: unknown;
	retryable?: unknown;
	action?: unknown;
	docs_url?: unknown;
	support_url?: unknown;
	retry_after_seconds?: unknown;
	details?: unknown;
	message?: unknown;
	description?: unknown;
	[key: string]: unknown;
};

export class PhaseoHttpError extends Error {
	readonly status: number;
	readonly statusText: string;
	readonly body: unknown;
	readonly headers: Record<string, string>;
	get traceUrl(): string | undefined { return this.requestId ? requestTraceUrl(this.requestId) : undefined; }
	get retryAfterMs(): number | undefined {
		const seconds = this.retryAfterSeconds;
		return seconds === undefined ? undefined : seconds * 1000;
	}

	constructor(args: {
		status: number;
		statusText: string;
		body: unknown;
		headers?: Record<string, string>;
		message?: string;
	}) {
		super(
			args.message ??
			`Request failed: ${args.status} ${args.statusText}${formatErrorBodySuffix(args.body)}`
		);
		this.name = "PhaseoHttpError";
		this.status = args.status;
		this.statusText = args.statusText;
		this.body = args.body;
		this.headers = Object.fromEntries(Object.entries(args.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
	}

	private get gatewayBody(): PhaseoGatewayErrorBody {
		return this.body && typeof this.body === "object" && !Array.isArray(this.body)
			? this.body as PhaseoGatewayErrorBody
			: {};
	}

	private readString(...values: unknown[]): string | undefined {
		for (const value of values) {
			if (typeof value === "string" && value.trim()) return value.trim();
		}
		return undefined;
	}

	get requestId(): string | undefined {
		return this.readString(
			this.gatewayBody.request_id,
			this.gatewayBody.requestId,
			this.headers["x-request-id"],
			this.headers["x-phaseo-request-id"],
		);
	}

	get generationId(): string | undefined {
		return this.readString(this.gatewayBody.generation_id, this.requestId);
	}

	get statusCode(): number {
		return this.status;
	}

	get code(): string | undefined {
		const nestedError = this.gatewayBody.error;
		const nestedCode = nestedError && typeof nestedError === "object" && !Array.isArray(nestedError)
			? (nestedError as Record<string, unknown>).code
			: undefined;
		return this.readString(this.gatewayBody.code, nestedCode, nestedError);
	}

	get errorType(): string | undefined {
		return this.readString(this.gatewayBody.error_type);
	}

	get errorOrigin(): string | undefined {
		return this.readString(this.gatewayBody.error_origin);
	}

	get retryable(): boolean | undefined {
		return typeof this.gatewayBody.retryable === "boolean" ? this.gatewayBody.retryable : undefined;
	}

	get action(): string | undefined {
		return this.readString(this.gatewayBody.action);
	}

	get docsUrl(): string | undefined {
		return this.readString(this.gatewayBody.docs_url);
	}

	get supportUrl(): string | undefined {
		return this.readString(this.gatewayBody.support_url);
	}

	get retryAfterSeconds(): number | undefined {
		const bodyValue = this.gatewayBody.retry_after_seconds;
		if (typeof bodyValue === "number" && Number.isFinite(bodyValue) && bodyValue >= 0) return bodyValue;
		const value = this.headers["retry-after"];
		if (!value) return undefined;
		const seconds = Number(value);
		if (Number.isFinite(seconds) && seconds >= 0) return seconds;
		const retryAt = Date.parse(value);
		if (!Number.isFinite(retryAt)) return undefined;
		return Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
	}

	get details(): unknown {
		return this.gatewayBody.details;
	}
}

export class Client {
	private readonly baseUrl: string;
	private readonly headers: Record<string, string>;
	private readonly fetchImpl: typeof fetch;
	private readonly controls: RequestControls;

	constructor(options: ClientOptions) {
		this.baseUrl = trimTrailingSlashes(options.baseUrl);
		this.headers = options.headers ?? {};
		this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
		if (!this.fetchImpl) {
			throw new Error("Global fetch is not available. Provide a fetch implementation.");
		}
		this.controls = options;
	}

	async request<T>(options: RequestOptions): Promise<T> {
		return (await this.requestWithResponse<T>(options)).data;
	}

	async requestWithResponse<T>(options: RequestOptions): Promise<RawResponse<T>> {
		const url = new URL(this.baseUrl + options.path);
		if (options.query) {
			for (const [key, value] of Object.entries(options.query)) {
				if (Array.isArray(value)) {
					value.forEach((item) => url.searchParams.append(key, String(item)));
				} else {
					url.searchParams.set(key, String(value));
				}
			}
		}

		const scopedControls = Object.fromEntries(
			Object.entries(options).filter(([, value]) => value !== undefined),
		) as RequestControls;
		const transport = createTransport(this.fetchImpl, { ...this.controls, ...scopedControls });
		const { body, headers } = prepareBody(options.body);
		const response = await transport(url.toString(), {
			method: options.method,
			headers: {
				Accept: "application/json",
				...this.headers,
				...(options.headers ?? {}),
				...headers
			},
			body,
		});
		const text = await response.text();
		const parsedBody = parseResponseText(text);
		if (!response.ok) {
			throw new PhaseoHttpError({
				status: response.status,
				statusText: response.statusText,
				body: parsedBody,
				headers: Object.fromEntries(response.headers.entries())
			});
		}
		let data: T;
		if (response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() === "application/x-ndjson") {
			data = text as T;
		} else if (!text) {
			data = undefined as T;
		} else {
			data = trackResponse(parsedBody, response) as T;
		}
		const requestId = response.headers.get("x-request-id") ?? response.headers.get("x-phaseo-request-id") ?? undefined;
		return {
			data,
			status: response.status,
			headers: response.headers,
			requestId,
			traceUrl: requestId ? requestTraceUrl(requestId) : undefined,
		};
	}
}

function trimTrailingSlashes(value: string): string {
	let end = value.length;
	while (end > 0 && value.charCodeAt(end - 1) === 47) {
		end -= 1;
	}
	return end === value.length ? value : value.slice(0, end);
}

function parseResponseText(text: string): unknown {
	if (!text) {
		return undefined;
	}
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}

function formatErrorBodySuffix(body: unknown): string {
	if (body === undefined || body === null || body === "") {
		return "";
	}
	if (typeof body === "string") {
		return ` - ${body}`;
	}
	try {
		return ` - ${JSON.stringify(body)}`;
	} catch {
		return "";
	}
}

function prepareBody(value: unknown): { body?: BodyInit; headers: Record<string, string> } {
	if (value === undefined || value === null) {
		return { headers: {} };
	}
	if (typeof FormData !== "undefined" && value instanceof FormData) {
		return { body: value, headers: {} };
	}
	if (typeof Blob !== "undefined" && value instanceof Blob) {
		return { body: value, headers: {} };
	}
	if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) {
		return { body: value, headers: {} };
	}
	if (value instanceof Uint8Array) {
		return { body: value.slice().buffer as ArrayBuffer, headers: {} };
	}
	if (typeof value === "string") {
		return { body: value, headers: { "Content-Type": "text/plain" } };
	}
	return { body: JSON.stringify(value), headers: { "Content-Type": "application/json" } };
}
