import { NextRequest } from "next/server";

type SupportedEndpoint =
	| "responses"
	| "images.generations"
	| "video.generation"
	| "music.generate"
	| "audio.speech";

type UnifiedPlaygroundRequest = {
	baseUrl?: string;
	apiKey?: string;
	endpoint?: SupportedEndpoint;
	requestBody?: Record<string, unknown>;
	appHeaders?: Record<string, string>;
	debug?: boolean;
	poll?: {
		resourceId: string;
		content?: boolean;
	};
};

const GATEWAY_BASE_URL = "https://api.phaseo.app/v1";
const ALLOWED_APP_HEADERS = new Set([
	"x-title",
	"http-referer",
	"x-app-id",
	"x-app-name",
]);

type UpstreamCause = {
	code?: string;
	errno?: number;
	syscall?: string;
	address?: string;
	port?: number;
};

const ENDPOINT_PATHS: Record<SupportedEndpoint, string> = {
	responses: "/responses",
	"images.generations": "/images/generations",
	"video.generation": "/videos",
	"music.generate": "/music/generate",
	"audio.speech": "/audio/speech",
};

function trimTrailingSlashes(value: string): string {
	let out = value.trim();
	while (out.endsWith("/")) out = out.slice(0, -1);
	return out;
}

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

const getUpstreamCause = (error: unknown): UpstreamCause | null => {
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
};

function isSupportedEndpoint(value: unknown): value is SupportedEndpoint {
	if (typeof value !== "string") return false;
	return value in ENDPOINT_PATHS;
}

function isTextLikeContentType(contentType: string): boolean {
	return (
		contentType.includes("application/json") ||
		contentType.startsWith("text/") ||
		contentType.includes("application/problem+json")
	);
}

function passthroughHeaders(upstream: Response, contentTypeOverride?: string): HeadersInit {
	const contentType = contentTypeOverride ?? upstream.headers.get("content-type");
	return contentType
		? { "Content-Type": contentType }
		: { "Content-Type": "application/octet-stream" };
}

async function forwardUpstreamResponse(args: {
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
			headers: passthroughHeaders(upstream, contentType || "application/json"),
		});
	}

	const bytes = await upstream.arrayBuffer();
	return new Response(bytes, {
		status: upstream.status,
		headers: passthroughHeaders(upstream),
	});
}

export async function POST(request: NextRequest) {
	let payload: UnifiedPlaygroundRequest = {};
	try {
		payload = (await request.json()) as UnifiedPlaygroundRequest;
	} catch {
		payload = {};
	}

	const gatewayBaseUrl = trimTrailingSlashes(GATEWAY_BASE_URL);
	const requestedBaseUrl =
		typeof payload.baseUrl === "string"
			? trimTrailingSlashes(payload.baseUrl)
			: "";
	const apiKey = payload.apiKey?.trim() ?? "";
	const endpoint = payload.endpoint;
	const requestBody = payload.requestBody ?? {};
	const appHeaders = sanitizeAppHeaders(payload.appHeaders);
	const debug = Boolean(payload.debug);
	const poll = payload.poll ?? null;

	if (requestedBaseUrl && requestedBaseUrl !== gatewayBaseUrl) {
		return new Response(
			JSON.stringify({
				error: "Custom baseUrl is not supported for this route.",
			}),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	if (!apiKey) {
		return new Response(
			JSON.stringify({ error: "Missing apiKey." }),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	if (!isSupportedEndpoint(endpoint)) {
		return new Response(
			JSON.stringify({ error: "Unsupported endpoint." }),
			{
				status: 400,
				headers: { "Content-Type": "application/json" },
			},
		);
	}

	let upstream: Response;
	try {
		if (poll) {
			if (endpoint !== "video.generation") {
				return new Response(
					JSON.stringify({
						error: "Polling is currently only supported for video generation.",
					}),
					{
						status: 400,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			const resourceId = String(poll.resourceId ?? "").trim();
			if (!resourceId) {
				return new Response(
					JSON.stringify({ error: "Missing poll.resourceId." }),
					{
						status: 400,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			const suffix = poll.content ? "/content" : "";
			upstream = await fetch(
				`${gatewayBaseUrl}/videos/${encodeURIComponent(resourceId)}${suffix}`,
				{
					method: "GET",
					headers: {
						...appHeaders,
						Authorization: `Bearer ${apiKey}`,
						...(debug ? { "x-gateway-debug": "true" } : {}),
					},
				},
			);
		} else {
			const streamRequested =
				endpoint === "responses" &&
				(requestBody as { stream?: unknown }).stream === true;

			upstream = await fetch(`${gatewayBaseUrl}${ENDPOINT_PATHS[endpoint]}`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...appHeaders,
					Authorization: `Bearer ${apiKey}`,
					...(debug ? { "x-gateway-debug": "true" } : {}),
					...(streamRequested ? { Accept: "text/event-stream" } : {}),
				},
				body: JSON.stringify(requestBody),
			});

			return forwardUpstreamResponse({
				upstream,
				streamRequested,
			});
		}
	} catch (error) {
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
						base_url: gatewayBaseUrl,
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

	return forwardUpstreamResponse({
		upstream,
		streamRequested: false,
	});
}
