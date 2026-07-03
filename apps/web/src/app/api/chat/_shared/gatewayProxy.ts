import type { NextRequest } from "next/server";
import {
	ChatGatewayAuthError,
	resolveChatGatewayContext,
} from "@/lib/server/chatGatewayAuth";

type UpstreamCause = {
	code?: string;
	errno?: number;
	syscall?: string;
	address?: string;
	port?: number;
};

export type ChatProxyEnvelope = {
	requestBody?: Record<string, unknown>;
	appHeaders?: Record<string, string>;
	debug?: boolean;
};

function normalizeGatewayBaseUrl(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const trimmed = value.trim().replace(/^['"]|['"]$/g, "");
	if (!trimmed) return undefined;
	const withoutTrailingSlash = trimmed.replace(/\/+$/, "");
	return withoutTrailingSlash.endsWith("/v1")
		? withoutTrailingSlash
		: `${withoutTrailingSlash}/v1`;
}

const configuredGatewayBaseUrl = normalizeGatewayBaseUrl(
	process.env.AI_STATS_GATEWAY_URL,
);
export const GATEWAY_BASE_URL = configuredGatewayBaseUrl ?? "";
const ALLOWED_APP_HEADERS = new Set([
	"x-title",
	"http-referer",
	"x-app-id",
	"x-app-name",
]);
const CANONICAL_CHAT_APP_HEADERS: Record<string, string> = {
	"x-app-id": "ai-stats-chat",
	"x-app-name": "AI Stats Chat",
	"x-title": "AI Stats Chat",
	"http-referer": "https://ai-stats.phaseo.app/chat",
};

function sanitizeAppHeaders(input: unknown): Record<string, string> {
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		return {};
	}
	const out: Record<string, string> = {};
	for (const [rawKey, rawValue] of Object.entries(input)) {
		const key = rawKey.trim().toLowerCase();
		if (!ALLOWED_APP_HEADERS.has(key)) continue;
		if (typeof rawValue !== "string") continue;
		out[key] = rawValue;
	}
	return out;
}

function getUpstreamCause(error: unknown): UpstreamCause | null {
	if (!error || typeof error !== "object" || !("cause" in error)) {
		return null;
	}
	const cause = (error as { cause?: unknown }).cause;
	if (!cause || typeof cause !== "object") return null;
	return {
		code:
			typeof (cause as { code?: unknown }).code === "string"
				? (cause as { code: string }).code
				: undefined,
		errno:
			typeof (cause as { errno?: unknown }).errno === "number"
				? (cause as { errno: number }).errno
				: undefined,
		syscall:
			typeof (cause as { syscall?: unknown }).syscall === "string"
				? (cause as { syscall: string }).syscall
				: undefined,
		address:
			typeof (cause as { address?: unknown }).address === "string"
				? (cause as { address: string }).address
				: undefined,
		port:
			typeof (cause as { port?: unknown }).port === "number"
				? (cause as { port: number }).port
				: undefined,
	};
}

function isTextLikeContentType(contentType: string): boolean {
	return (
		contentType.includes("application/json") ||
		contentType.startsWith("text/") ||
		contentType.includes("application/problem+json")
	);
}

function passthroughHeaders(
	upstream: Response,
	contentTypeOverride?: string,
): HeadersInit {
	const contentType =
		contentTypeOverride ?? upstream.headers.get("content-type");
	return contentType
		? { "Content-Type": contentType }
		: { "Content-Type": "application/octet-stream" };
}

export async function parseProxyEnvelope(
	request: NextRequest,
): Promise<ChatProxyEnvelope> {
	try {
		return (await request.json()) as ChatProxyEnvelope;
	} catch {
		return {};
	}
}

async function resolveGatewayApiKey(): Promise<string | Response> {
	try {
		const auth = await resolveChatGatewayContext();
		return auth.apiKey;
	} catch (error) {
		if (error instanceof ChatGatewayAuthError) {
			return new Response(
				JSON.stringify({ error: error.code, message: error.message }),
				{
					status: error.status,
					headers: { "Content-Type": "application/json" },
				},
			);
		}
		return new Response(
			JSON.stringify({
				error: "chat_auth_failed",
				message: "Unable to authenticate this chat request.",
			}),
			{
				status: 500,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
}

function buildProxyHeaders(args: {
	appHeaders?: unknown;
	debug?: boolean;
	stream?: boolean;
	apiKey: string;
	contentType?: string | null;
}): HeadersInit {
	const {
		appHeaders,
		debug = false,
		stream = false,
		apiKey,
		contentType = "application/json",
	} = args;
	return {
		...(contentType ? { "Content-Type": contentType } : {}),
		...sanitizeAppHeaders(appHeaders),
		...CANONICAL_CHAT_APP_HEADERS,
		Authorization: `Bearer ${apiKey}`,
		...(debug ? { "x-gateway-debug": "true" } : {}),
		...(stream ? { Accept: "text/event-stream" } : {}),
	};
}

function buildGatewayUnreachableResponse(
	error: unknown,
	baseUrl: string,
): Response {
	const isDevelopment = process.env.NODE_ENV !== "production";
	const cause = getUpstreamCause(error);
	const details = [
		cause?.code,
		cause?.address && cause?.port
			? `${cause.address}:${cause.port}`
			: cause?.address,
	]
		.filter(Boolean)
		.join(" ");

	return new Response(
		JSON.stringify({
			error: "gateway_unreachable",
			message: isDevelopment
				? `Could not reach gateway${details ? ` (${details})` : ""}.`
				: "The gateway is temporarily unavailable. Please try again.",
			...(isDevelopment
				? {
						base_url: GATEWAY_BASE_URL,
						effective_base_url: baseUrl,
						cause: cause ?? undefined,
					}
				: {}),
		}),
		{
			status: 502,
			headers: { "Content-Type": "application/json" },
		},
	);
}

function buildGatewayMissingConfigResponse(): Response {
	return new Response(
		JSON.stringify({
			error: "gateway_not_configured",
			message: "Missing AI_STATS_GATEWAY_URL for chat gateway proxy.",
		}),
		{
			status: 500,
			headers: { "Content-Type": "application/json" },
		},
	);
}

function resolveGatewayBaseUrl(): string | null {
	return configuredGatewayBaseUrl ?? null;
}

export async function forwardUpstreamResponse(args: {
	upstream: Response;
	streamRequested: boolean;
}): Promise<Response> {
	const { upstream, streamRequested } = args;

	if (streamRequested && upstream.body) {
		return new Response(upstream.body, {
			status: upstream.status,
			headers: {
				"Content-Type":
					upstream.headers.get("content-type") ??
					"text/event-stream; charset=utf-8",
				"Cache-Control": "no-cache, no-transform",
				Connection: "keep-alive",
			},
		});
	}

	const contentType = upstream.headers.get("content-type") ?? "";
	if (isTextLikeContentType(contentType)) {
		const text = await upstream.text();
		return new Response(text, {
			status: upstream.status,
			headers: passthroughHeaders(
				upstream,
				contentType || "application/json",
			),
		});
	}

	const bytes = await upstream.arrayBuffer();
	return new Response(bytes, {
		status: upstream.status,
		headers: passthroughHeaders(upstream),
	});
}

export async function proxyGatewayPost(args: {
	path: string;
	requestBody?: Record<string, unknown>;
	appHeaders?: unknown;
	debug?: boolean;
	stream?: boolean;
	contentType?: string | null;
}): Promise<Response> {
	const gatewayBaseUrl = resolveGatewayBaseUrl();
	if (!gatewayBaseUrl) {
		return buildGatewayMissingConfigResponse();
	}

	const apiKeyOrResponse = await resolveGatewayApiKey();
	if (apiKeyOrResponse instanceof Response) {
		return apiKeyOrResponse;
	}

	let upstream: Response;
	try {
		upstream = await fetch(`${gatewayBaseUrl}${args.path}`, {
			method: "POST",
			headers: buildProxyHeaders({
				appHeaders: args.appHeaders,
				debug: args.debug,
				stream: args.stream,
				apiKey: apiKeyOrResponse,
				contentType: args.contentType,
			}),
			body: JSON.stringify(args.requestBody ?? {}),
		});
	} catch (error) {
		return buildGatewayUnreachableResponse(error, gatewayBaseUrl);
	}

	return forwardUpstreamResponse({
		upstream,
		streamRequested: Boolean(args.stream),
	});
}

export async function proxyGatewayGet(args: {
	path: string;
	appHeaders?: unknown;
	debug?: boolean;
}): Promise<Response> {
	const gatewayBaseUrl = resolveGatewayBaseUrl();
	if (!gatewayBaseUrl) {
		return buildGatewayMissingConfigResponse();
	}

	const apiKeyOrResponse = await resolveGatewayApiKey();
	if (apiKeyOrResponse instanceof Response) {
		return apiKeyOrResponse;
	}

	let upstream: Response;
	try {
		upstream = await fetch(`${gatewayBaseUrl}${args.path}`, {
			method: "GET",
			headers: buildProxyHeaders({
				appHeaders: args.appHeaders,
				debug: args.debug,
				apiKey: apiKeyOrResponse,
				contentType: null,
			}),
		});
	} catch (error) {
		return buildGatewayUnreachableResponse(error, gatewayBaseUrl);
	}

	return forwardUpstreamResponse({
		upstream,
		streamRequested: false,
	});
}
