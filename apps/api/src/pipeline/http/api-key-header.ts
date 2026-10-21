// src/pipeline/http/api-key-header.ts
// Purpose: Accept a gateway key sent in the `x-api-key` header.
// Why: Anthropic SDKs released before API version 2026-10-21 send `apiKey` as `x-api-key`.
// How: Moves the key into `Authorization: Bearer`, the only header gateway auth reads.

/**
 * Anthropic SDKs before `@anthropic-ai/sdk` 1.0 and `anthropic` 2.0 send the
 * `apiKey` option as `x-api-key`; later ones send it as `Authorization: Bearer`.
 * The Claude API accepts either header
 * (https://platform.claude.com/docs/en/api/migration-2026-10-21), so both SDK
 * generations work against `/v1` with the same client code.
 *
 * Runs before routing so admission, authentication and classifier sub-requests
 * all see one credential. A request that already has an `Authorization` header
 * is returned unchanged: that header keeps precedence.
 */
export function withApiKeyHeaderAsBearer(req: Request): Request {
	if (req.headers.has("authorization")) return req;
	const key = req.headers.get("x-api-key")?.trim();
	if (!key) return req;
	if (!new URL(req.url).pathname.startsWith("/v1/")) return req;
	const headers = new Headers(req.headers);
	headers.delete("x-api-key");
	headers.set("authorization", `Bearer ${key}`);
	return new Request(req, { headers });
}
