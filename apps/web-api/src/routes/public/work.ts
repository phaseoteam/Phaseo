import { Hono, type Context } from "hono";
import { getDataClient } from "@/data/supabase";
import type { Env } from "@/env";
import { ingestErrorEvents, loadErrorProject, MAX_ERROR_BYTES, parseErrorPayload } from "@/work/errorIngest";
import { parseSourcemapTarget, SOURCEMAP_COLUMNS, sourcemapObjectKey } from "@/work/errorTools";
import { MAX_SOURCEMAP_BYTES, SourceMapReader } from "@/work/sourcemap";
import { publicWorkApiRouter } from "@/work/publicApi";
import { ERRORS_SCRIPT, ERRORS_SCRIPT_CACHE_SECONDS } from "@/work/errorsScript";
import { handleBridgeEvent, loadGithubRepoLink, MAX_GITHUB_BYTES, parseBridgePayload } from "@/work/githubBridge";
import { onWorkItemDone } from "@/work/support";
import { loadIntakeForm, MAX_ASK_BYTES, parseAskRequest, recordAsk } from "@/work/intake";
import { hashWorkToken, isWorkToken, type WorkTokenKind } from "@/work/tokens";

// Public work tracker endpoints, mounted at /api/_web/work. There is no user session: the token in
// the path is the credential. Its shape is checked before any database lookup, then its SHA-256
// hash is looked up. Asks and errors accept cross-origin posts from any site (public forms and
// browser apps); the GitHub bridge is called by the repository's Actions workflow. Source maps are
// uploaded from a build (CI) with the project's secret upload token (pws_) as a bearer token,
// never the ingest key, which is public in the app's pages.
export const publicWorkRouter = new Hono<{ Bindings: Env }>();

// The public work API for scripts and integrations (work API keys): /api/_web/work/v1/...
publicWorkRouter.route("/v1", publicWorkApiRouter);

type WorkContext = Context<{ Bindings: Env }>;

const NO_STORE = { "Cache-Control": "no-store" } as const;
const CORS_HEADERS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
	"Access-Control-Max-Age": "86400",
} as const;
const PUBLIC_POST_HEADERS = { ...NO_STORE, "Access-Control-Allow-Origin": "*" } as const;

class BodyTooLargeError extends Error {}

/** Reads the body as UTF-8 text, stopping once it passes the limit (with or without content-length). */
export async function readLimitedText(request: Request, maxBytes: number): Promise<string> {
	const declared = Number(request.headers.get("content-length") ?? "");
	if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError();
	if (!request.body) return "";
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel().catch(() => undefined);
			throw new BodyTooLargeError();
		}
		chunks.push(value);
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(bytes);
}

function backgroundRunner(c: WorkContext): (promise: Promise<unknown>) => void {
	try {
		const ctx = c.executionCtx;
		return (promise) => ctx.waitUntil(promise);
	} catch {
		// Outside a Worker (tests): let the promise run on its own.
		return (promise) => {
			promise.catch(() => undefined);
		};
	}
}

/** Applies the public rate limit when the binding exists. Returns a 429 response, or null to go on. */
async function rateLimited(c: WorkContext, kind: WorkTokenKind, tokenHash: string, headers: Record<string, string>): Promise<Response | null> {
	const limiter = c.env.WORK_PUBLIC_RATE_LIMITER;
	if (!limiter) return null;
	const ip = c.req.header("cf-connecting-ip") ?? "unknown";
	try {
		const { success } = await limiter.limit({ key: `${kind}:${tokenHash.slice(0, 16)}:${ip}` });
		if (success) return null;
	} catch (error) {
		console.error("[work] rate limit failed", { kind, message: error instanceof Error ? error.message : String(error) });
		return null;
	}
	return c.json({ error: "rate_limited" }, 429, { ...headers, "Retry-After": "60" });
}

async function readBody(c: WorkContext, maxBytes: number, headers: Record<string, string>): Promise<{ text: string } | { response: Response }> {
	try {
		return { text: await readLimitedText(c.req.raw, maxBytes) };
	} catch (error) {
		if (error instanceof BodyTooLargeError) return { response: c.json({ error: "payload_too_large" }, 413, headers) };
		return { response: c.json({ error: "invalid_body" }, 400, headers) };
	}
}

function preflight(c: WorkContext) {
	return c.body(null, 204, CORS_HEADERS);
}

publicWorkRouter.options("/asks/:token", preflight);
publicWorkRouter.options("/errors/:key", preflight);

publicWorkRouter.get("/errors.js", (c) =>
	c.body(ERRORS_SCRIPT, 200, {
		"Content-Type": "application/javascript; charset=utf-8",
		"Cache-Control": `public, max-age=${ERRORS_SCRIPT_CACHE_SECONDS}`,
		"Access-Control-Allow-Origin": "*",
		"Cross-Origin-Resource-Policy": "cross-origin",
		"X-Content-Type-Options": "nosniff",
	}),
);

publicWorkRouter.post("/asks/:token", async (c) => {
	const token = c.req.param("token");
	if (!isWorkToken("form", token)) return c.json({ error: "not_found" }, 404, PUBLIC_POST_HEADERS);
	const tokenHash = await hashWorkToken(token);
	const limited = await rateLimited(c, "form", tokenHash, PUBLIC_POST_HEADERS);
	if (limited) return limited;
	const body = await readBody(c, MAX_ASK_BYTES, PUBLIC_POST_HEADERS);
	if ("response" in body) return body.response;
	const parsed = await parseAskRequest(c.req.header("content-type") ?? null, body.text);
	// "in" narrows here; the package isn't in strict mode, so `!parsed.ok` doesn't.
	if ("code" in parsed) return c.json({ error: parsed.code, message: parsed.message }, parsed.code === "unsupported_media_type" ? 415 : 400, PUBLIC_POST_HEADERS);

	try {
		const client = getDataClient(c.env);
		const form = await loadIntakeForm(client, tokenHash);
		if (!form) return c.json({ error: "not_found" }, 404, PUBLIC_POST_HEADERS);
		const { reference } = await recordAsk({ env: c.env, client, form, ask: parsed.ask, waitUntil: backgroundRunner(c) });
		if (parsed.isForm && parsed.ask.redirect) {
			return c.body(null, 303, { ...PUBLIC_POST_HEADERS, Location: parsed.ask.redirect });
		}
		return c.json({ ok: true, reference }, 200, PUBLIC_POST_HEADERS);
	} catch (error) {
		console.error("[work] ask intake failed", { message: error instanceof Error ? error.message : String(error) });
		return c.json({ error: "intake_failed" }, 500, PUBLIC_POST_HEADERS);
	}
});

publicWorkRouter.post("/errors/:key", async (c) => {
	const key = c.req.param("key");
	if (!isWorkToken("errors", key)) return c.json({ error: "not_found" }, 404, PUBLIC_POST_HEADERS);
	const keyHash = await hashWorkToken(key);
	const limited = await rateLimited(c, "errors", keyHash, PUBLIC_POST_HEADERS);
	if (limited) return limited;
	const body = await readBody(c, MAX_ERROR_BYTES, PUBLIC_POST_HEADERS);
	if ("response" in body) return body.response;
	// The browser script sends text/plain to avoid a preflight, so any content type is read as JSON.
	let json: unknown;
	try {
		json = JSON.parse(body.text);
	} catch {
		return c.json({ error: "invalid_json" }, 400, PUBLIC_POST_HEADERS);
	}
	const events = parseErrorPayload(json);
	if (!events) return c.json({ error: "invalid_events", message: "Send an error event or { events } with 1 to 20 events" }, 400, PUBLIC_POST_HEADERS);

	try {
		const client = getDataClient(c.env);
		const project = await loadErrorProject(client, keyHash);
		if (!project) return c.json({ error: "not_found" }, 404, PUBLIC_POST_HEADERS);
		const groups = await ingestErrorEvents({ env: c.env, client, project, events, waitUntil: backgroundRunner(c) });
		return c.json({ ok: true, groups }, 200, PUBLIC_POST_HEADERS);
	} catch (error) {
		console.error("[work] error ingest failed", { message: error instanceof Error ? error.message : String(error) });
		return c.json({ error: "ingest_failed" }, 500, PUBLIC_POST_HEADERS);
	}
});

/**
 * POST /sourcemaps?release=<release>&file=<minified file name>, Authorization: Bearer pws_..., body:
 * the source map JSON (at most 10 MB). Replaces any map for the same release and file.
 */
publicWorkRouter.post("/sourcemaps", async (c) => {
	const token = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
	if (!isWorkToken("uploads", token)) return c.json({ error: "unauthorized" }, 401, NO_STORE);
	const tokenHash = await hashWorkToken(token);
	const limited = await rateLimited(c, "uploads", tokenHash, NO_STORE);
	if (limited) return limited;
	const target = parseSourcemapTarget(c.req.query("release"), c.req.query("file"));
	if (target.ok === false) return c.json({ error: "invalid_target", message: target.message }, 400, NO_STORE);
	const bucket = c.env.WORK_FILES;
	if (!bucket) return c.json({ error: "sourcemaps_unavailable", message: "Source maps aren't set up on this server yet" }, 503, NO_STORE);
	const body = await readBody(c, MAX_SOURCEMAP_BYTES, NO_STORE);
	if ("response" in body) return body.response;
	if (!SourceMapReader.parse(body.text)) return c.json({ error: "invalid_sourcemap", message: "Send a version 3 source map (index maps aren't supported)" }, 400, NO_STORE);
	try {
		const client = getDataClient(c.env);
		const { data: project, error } = await client.from("work_error_projects").select("id,workspace_id,enabled").eq("upload_key_hash", tokenHash).maybeSingle();
		if (error) throw new Error(error.message);
		if (!project?.enabled) return c.json({ error: "unauthorized" }, 401, NO_STORE);
		const objectKey = await sourcemapObjectKey(project.id, target.release, target.file);
		const size = new TextEncoder().encode(body.text).byteLength;
		await bucket.put(objectKey, body.text, { httpMetadata: { contentType: "application/json" } });
		const saved = await client.from("work_error_sourcemaps").upsert({
			workspace_id: project.workspace_id,
			project_id: project.id,
			release: target.release,
			file: target.file,
			object_key: objectKey,
			size_bytes: size,
			created_at: new Date().toISOString(),
		}, { onConflict: "project_id,release,file" }).select(SOURCEMAP_COLUMNS).maybeSingle();
		if (saved.error) throw new Error(saved.error.message);
		return c.json({ ok: true, release: target.release, file: target.file, sizeBytes: size }, 200, NO_STORE);
	} catch (error) {
		console.error("[work] source map upload failed", { message: error instanceof Error ? error.message : String(error) });
		return c.json({ error: "upload_failed" }, 500, NO_STORE);
	}
});

publicWorkRouter.post("/github/:token", async (c) => {
	const token = c.req.param("token");
	if (!isWorkToken("github", token)) return c.json({ error: "not_found" }, 404, NO_STORE);
	const tokenHash = await hashWorkToken(token);
	const limited = await rateLimited(c, "github", tokenHash, NO_STORE);
	if (limited) return limited;
	const body = await readBody(c, MAX_GITHUB_BYTES, NO_STORE);
	if ("response" in body) return body.response;
	let json: unknown;
	try {
		json = JSON.parse(body.text);
	} catch {
		return c.json({ error: "invalid_json" }, 400, NO_STORE);
	}
	const payload = parseBridgePayload(json);
	if (!payload) return c.json({ error: "invalid_event" }, 400, NO_STORE);

	try {
		const client = getDataClient(c.env);
		const link = await loadGithubRepoLink(client, tokenHash);
		if (!link) return c.json({ error: "not_found" }, 404, NO_STORE);
		if (payload.repo.toLowerCase() !== link.repo.toLowerCase()) return c.json({ error: "repo_mismatch" }, 403, NO_STORE);
		const outcome = await handleBridgeEvent(client, link, payload);
		// A closed issue or merged pull request finished these items: draft replies to the customers who asked.
		for (const itemId of outcome.doneItemIds ?? []) {
			backgroundRunner(c)(onWorkItemDone({ env: c.env, client, workspaceId: link.workspace_id, itemId, waitUntil: backgroundRunner(c) }));
		}
		backgroundRunner(c)(Promise.resolve(
			client.from("work_github_repos").update({ last_event_at: new Date().toISOString() }).eq("id", link.id),
		));
		return c.json({ ok: true, handled: outcome.handled }, 200, NO_STORE);
	} catch (error) {
		console.error("[work] github bridge failed", { message: error instanceof Error ? error.message : String(error) });
		return c.json({ error: "bridge_failed" }, 500, NO_STORE);
	}
});
