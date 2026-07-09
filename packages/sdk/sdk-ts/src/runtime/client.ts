export type RequestOptions = {
	method: string;
	path: string;
	query?: Record<string, string | number | boolean | Array<string | number | boolean>>;
	headers?: Record<string, string>;
	body?: unknown;
};

export type ClientOptions = {
	baseUrl: string;
	headers?: Record<string, string>;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
};

export class PhaseoHttpError extends Error {
	readonly status: number;
	readonly statusText: string;
	readonly body: unknown;
	readonly headers: Record<string, string>;

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
		this.headers = args.headers ?? {};
	}
}

export class Client {
	private readonly baseUrl: string;
	private readonly headers: Record<string, string>;
	private readonly fetchImpl: typeof fetch;
	private readonly timeoutMs: number;

	constructor(options: ClientOptions) {
		this.baseUrl = trimTrailingSlashes(options.baseUrl);
		this.headers = options.headers ?? {};
		this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
		if (!this.fetchImpl) {
			throw new Error("Global fetch is not available. Provide a fetch implementation.");
		}
		this.timeoutMs = options.timeoutMs ?? 60_000;
	}

	async request<T>(options: RequestOptions): Promise<T> {
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

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
		const { body, headers } = prepareBody(options.body);
		try {
			const response = await this.fetchImpl(url.toString(), {
				method: options.method,
				headers: {
					Accept: "application/json",
					...this.headers,
					...(options.headers ?? {}),
					...headers
				},
				body,
				signal: controller.signal
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
			if (!text) {
				return undefined as T;
			}
			return parsedBody as T;
		} finally {
			clearTimeout(timeout);
		}
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
		const buffer = value.buffer;
		if (buffer instanceof ArrayBuffer) {
			return { body: buffer, headers: {} };
		}
		return { body: value.slice().buffer as ArrayBuffer, headers: {} };
	}
	if (typeof value === "string") {
		return { body: value, headers: { "Content-Type": "text/plain" } };
	}
	return { body: JSON.stringify(value), headers: { "Content-Type": "application/json" } };
}
