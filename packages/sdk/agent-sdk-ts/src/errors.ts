export type AgentGatewayErrorBody = {
	message?: string;
	error?: unknown;
	reason?: string;
	error_origin?: string;
	error_type?: string;
	request_id?: string;
	generation_id?: string;
	failed_providers?: string[];
	failed_statuses?: number[];
	provider_failure_diagnostics?: Record<string, unknown>;
	provider_enablement?: Record<string, unknown>;
	routing_diagnostics?: Record<string, unknown>;
	details?: Array<Record<string, unknown>>;
	[key: string]: unknown;
} | string | undefined;

export type AgentGatewayErrorDetails = {
	status: number;
	statusText: string;
	message: string;
	requestId: string | null;
	generationId: string | null;
	reason: string | null;
	errorOrigin: string | null;
	errorType: string | null;
	failedProviders: string[];
	failedStatuses: number[];
	providerFailureDiagnostics: Record<string, unknown> | null;
	providerEnablement: Record<string, unknown> | null;
	routingDiagnostics: Record<string, unknown> | null;
	details: Array<Record<string, unknown>>;
};

type AgentGatewayErrorLike = {
	status: number;
	statusText: string;
	body: unknown;
	headers?: Record<string, unknown>;
	message?: string;
	name?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function normalizeHeaders(value: unknown): Record<string, string> {
	if (!isRecord(value)) return {};
	const headers: Record<string, string> = {};
	for (const [key, rawValue] of Object.entries(value)) {
		if (typeof rawValue === "string") {
			headers[key.toLowerCase()] = rawValue;
		}
	}
	return headers;
}

function readString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function headerValue(headers: Record<string, string>, ...keys: string[]): string | undefined {
	for (const key of keys) {
		const value = headers[key.toLowerCase()];
		if (typeof value === "string" && value.length > 0) return value;
	}
	return undefined;
}

function isGatewayHttpErrorLike(value: unknown): value is AgentGatewayErrorLike {
	if (!isRecord(value)) return false;
	return (
		typeof value.status === "number" &&
		typeof value.statusText === "string" &&
		"body" in value &&
		(value.name === "AIStatsHttpError" || "headers" in value)
	);
}

function formatGatewayErrorMessage(args: {
	status: number;
	statusText: string;
	body: AgentGatewayErrorBody;
	fallback?: string;
}) {
	if (args.fallback) return args.fallback;
	if (typeof args.body === "string" && args.body.trim().length > 0) {
		return `Gateway request failed: ${args.status} ${args.statusText} - ${args.body}`;
	}
	if (isRecord(args.body)) {
		const message =
			readString(args.body.message) ??
			readString(args.body.description) ??
			readString(args.body.reason);
		if (message) {
			return `Gateway request failed: ${args.status} ${args.statusText} - ${message}`;
		}
	}
	return `Gateway request failed: ${args.status} ${args.statusText}`;
}

export class AgentGatewayError extends Error {
	readonly status: number;
	readonly statusText: string;
	readonly headers: Record<string, string>;
	readonly body: AgentGatewayErrorBody;
	readonly requestId: string | null;
	readonly generationId: string | null;
	readonly reason: string | null;
	readonly errorOrigin: string | null;
	readonly errorType: string | null;
	readonly failedProviders: string[];
	readonly failedStatuses: number[];
	readonly providerFailureDiagnostics: Record<string, unknown> | null;
	readonly providerEnablement: Record<string, unknown> | null;
	readonly routingDiagnostics: Record<string, unknown> | null;
	readonly details: Array<Record<string, unknown>>;

	constructor(args: {
		status: number;
		statusText: string;
		headers?: Record<string, string>;
		body: AgentGatewayErrorBody;
		message?: string;
		cause?: unknown;
	}) {
		super(
			formatGatewayErrorMessage({
				status: args.status,
				statusText: args.statusText,
				body: args.body,
				fallback: args.message,
			}),
			{ cause: args.cause },
		);
		this.name = "AgentGatewayError";
		this.status = args.status;
		this.statusText = args.statusText;
		this.headers = args.headers ?? {};
		this.body = args.body;

		if (isRecord(args.body)) {
			this.requestId =
				readString(args.body.request_id) ??
				headerValue(this.headers, "x-request-id", "request-id", "x-ai-stats-request-id") ??
				null;
			this.generationId = readString(args.body.generation_id) ?? null;
			this.reason = readString(args.body.reason) ?? null;
			this.errorOrigin = readString(args.body.error_origin) ?? null;
			this.errorType = readString(args.body.error_type) ?? null;
			this.failedProviders = Array.isArray(args.body.failed_providers)
				? args.body.failed_providers.filter((value): value is string => typeof value === "string")
				: [];
			this.failedStatuses = Array.isArray(args.body.failed_statuses)
				? args.body.failed_statuses.filter((value): value is number => typeof value === "number")
				: [];
			this.providerFailureDiagnostics = isRecord(args.body.provider_failure_diagnostics)
				? args.body.provider_failure_diagnostics
				: null;
			this.providerEnablement = isRecord(args.body.provider_enablement)
				? args.body.provider_enablement
				: null;
			this.routingDiagnostics = isRecord(args.body.routing_diagnostics)
				? args.body.routing_diagnostics
				: null;
			this.details = Array.isArray(args.body.details)
				? args.body.details.filter((value): value is Record<string, unknown> => isRecord(value))
				: [];
		} else {
			this.requestId =
				headerValue(this.headers, "x-request-id", "request-id", "x-ai-stats-request-id") ??
				null;
			this.generationId = null;
			this.reason = null;
			this.errorOrigin = null;
			this.errorType = null;
			this.failedProviders = [];
			this.failedStatuses = [];
			this.providerFailureDiagnostics = null;
			this.providerEnablement = null;
			this.routingDiagnostics = null;
			this.details = [];
		}
	}

	static fromUnknown(error: unknown): AgentGatewayError | null {
		if (!isGatewayHttpErrorLike(error)) return null;
		return new AgentGatewayError({
			status: error.status,
			statusText: error.statusText,
			headers: normalizeHeaders(error.headers),
			body: error.body as AgentGatewayErrorBody,
			message: typeof error.message === "string" ? error.message : undefined,
			cause: error,
		});
	}
}

export function isAgentGatewayError(error: unknown): error is AgentGatewayError {
	return error instanceof AgentGatewayError;
}

export function toAgentGatewayErrorDetails(error: AgentGatewayError): AgentGatewayErrorDetails {
	return {
		status: error.status,
		statusText: error.statusText,
		message: error.message,
		requestId: error.requestId,
		generationId: error.generationId,
		reason: error.reason,
		errorOrigin: error.errorOrigin,
		errorType: error.errorType,
		failedProviders: [...error.failedProviders],
		failedStatuses: [...error.failedStatuses],
		providerFailureDiagnostics: error.providerFailureDiagnostics
			? structuredClone(error.providerFailureDiagnostics)
			: null,
		providerEnablement: error.providerEnablement
			? structuredClone(error.providerEnablement)
			: null,
		routingDiagnostics: error.routingDiagnostics
			? structuredClone(error.routingDiagnostics)
			: null,
		details: structuredClone(error.details),
	};
}
