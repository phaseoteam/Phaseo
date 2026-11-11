import { Hono, type Context } from "hono";
import type { Env } from "@/env";
import { authenticateScim, type ScimAuthContext, type ScimAuthRefusal } from "./auth";
import { resourceTypes, schemas, serviceProviderConfig } from "./discovery";
import { scimError, scimJson } from "./http";
import { ScimProtocolError } from "./errors";
import { parsePagination, parseScimFilter } from "./filter";
import { getDataClient } from "@/data/supabase";
import { ScimUserService } from "./users";
import { writeScimAudit } from "./audit";
import { ScimGroupService } from "./groups";
import { SCIM_URNS } from "./constants";
import { executeBulk } from "./bulk";

type ScimVariables = { scim: ScimAuthContext };
type Authenticate = (request: Request, env: Env) => Promise<ScimAuthContext | ScimAuthRefusal | null>;

export function createScimRouter(authenticate: Authenticate = authenticateScim) {
	const router = new Hono<{ Bindings: Env; Variables: ScimVariables }>();

	router.use("*", async (c, next) => {
		const limiter = c.env.SCIM_RATE_LIMITER;
		const sourceAddress = c.req.header("cf-connecting-ip") ?? c.req.header("x-real-ip") ?? "unknown";
		try {
			if (!limiter && c.env.ENV === "production") return scimError(503, "SCIM rate limiting is temporarily unavailable.");
			if (limiter && !(await limiter.limit({ key: `unauthenticated:${sourceAddress}` })).success) {
				const response = scimError(429, "Too many SCIM requests. Retry shortly.", "tooMany"); response.headers.set("retry-after", "1"); return response;
			}
		} catch (error) {
			console.error("[web-api/scim] pre-auth rate limiter unavailable", { sourceAddress, error: error instanceof Error ? error.message : String(error) });
			if (c.env.ENV === "production") return scimError(503, "SCIM rate limiting is temporarily unavailable.");
		}
		const context = await authenticate(c.req.raw, c.env);
		if (!context) return scimError(401, "A valid SCIM bearer token is required.");
		if ("refused" in context) return scimError(401, context.refused);
		c.set("scim", context);
		try {
			if (limiter && !(await limiter.limit({ key: context.tokenId })).success) {
				const response = scimError(429, "Too many SCIM requests. Retry shortly.", "tooMany"); response.headers.set("retry-after", "1"); return response;
			}
		} catch (error) {
			console.error("[web-api/scim] rate limiter unavailable", { tokenId: context.tokenId, error: error instanceof Error ? error.message : String(error) });
			if (c.env.ENV === "production") return scimError(503, "SCIM rate limiting is temporarily unavailable.");
		}
		await next();
	});

	router.get("/ServiceProviderConfig", () => scimJson(serviceProviderConfig));
	router.get("/ResourceTypes", () => scimJson(resourceTypes));
	router.get("/Schemas", () => scimJson(schemas));
	router.get("/Schemas/:id", (c) => {
		const schema = schemas.Resources.find((item) => item.id === c.req.param("id"));
		return schema ? scimJson(schema) : scimError(404, "Schema not found.", "noTarget");
	});

	function users(c: Context<{ Bindings: Env; Variables: ScimVariables }>) {
		const url = new URL(c.req.url);
		return new ScimUserService(getDataClient(c.env), c.get("scim").workspaceId, `${url.origin}/scim/v2`);
	}
	function groups(c: Context<{ Bindings: Env; Variables: ScimVariables }>) {
		const url = new URL(c.req.url);
		return new ScimGroupService(getDataClient(c.env), c.get("scim").workspaceId, `${url.origin}/scim/v2`);
	}

	router.post("/Users", async (c) => {
		const auth = c.get("scim"); const client = getDataClient(c.env);
		try {
			const user = await users(c).create(await readScimJson(c.req.raw));
			await writeScimAudit(client, c.req.raw, auth, { action: "scim.user.created", outcome: "success", status: 201, resourceType: "User", resourceId: String(user.id) });
			const response = scimJson(user, 201); response.headers.set("location", String(user.meta.location)); return response;
		} catch (error) { return auditError(client, c.req.raw, auth, "scim.user.created", error); }
	});

	router.get("/Users", async (c) => {
		try {
			const page = parsePagination({ startIndex: c.req.query("startIndex"), count: c.req.query("count") });
			const result = await users(c).list(parseScimFilter(c.req.query("filter")), page.startIndex, page.count);
			return scimJson({ schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"], totalResults: result.totalResults, startIndex: page.startIndex, itemsPerPage: result.resources.length, Resources: result.resources });
		} catch (error) { return protocolError(error); }
	});

	router.get("/Users/:id", async (c) => {
		try { return scimJson(await users(c).get(c.req.param("id"))); } catch (error) { return protocolError(error); }
	});

	for (const method of ["put", "patch"] as const) router[method]("/Users/:id", async (c) => {
		const auth = c.get("scim"); const client = getDataClient(c.env); const id = c.req.param("id"); const action = method === "put" ? "scim.user.replaced" : "scim.user.patched";
		try {
			const service = users(c); const body = await readScimJson(c.req.raw); const user = method === "put" ? await service.replace(id, body) : await service.patch(id, body);
			await writeScimAudit(client, c.req.raw, auth, { action, outcome: "success", status: 200, resourceType: "User", resourceId: id });
			return scimJson(user);
		} catch (error) { return auditError(client, c.req.raw, auth, action, error, "User", id); }
	});

	router.delete("/Users/:id", async (c) => {
		const auth = c.get("scim"); const client = getDataClient(c.env); const id = c.req.param("id");
		try {
			await users(c).deactivate(id);
			await writeScimAudit(client, c.req.raw, auth, { action: "scim.user.deactivated", outcome: "success", status: 204, resourceType: "User", resourceId: id });
			return new Response(null, { status: 204 });
		} catch (error) { return auditError(client, c.req.raw, auth, "scim.user.deactivated", error, "User", id); }
	});

	router.post("/Groups", async (c) => {
		const auth = c.get("scim"); const client = getDataClient(c.env);
		try { const group = await groups(c).create(await readScimJson(c.req.raw)); await writeScimAudit(client, c.req.raw, auth, { action: "scim.group.created", outcome: "success", status: 201, resourceType: "Group", resourceId: String(group.id) }); const response = scimJson(group, 201); response.headers.set("location", String(group.meta.location)); return response; }
		catch (error) { return auditError(client, c.req.raw, auth, "scim.group.created", error); }
	});

	router.get("/Groups", async (c) => {
		try { const page = parsePagination({ startIndex: c.req.query("startIndex"), count: c.req.query("count") }); const result = await groups(c).list(parseScimFilter(c.req.query("filter")), page.startIndex, page.count); return scimJson({ schemas: [SCIM_URNS.listResponse], totalResults: result.totalResults, startIndex: page.startIndex, itemsPerPage: result.resources.length, Resources: result.resources }); }
		catch (error) { return protocolError(error); }
	});

	router.get("/Groups/:id", async (c) => { try { return scimJson(await groups(c).get(c.req.param("id"))); } catch (error) { return protocolError(error); } });

	for (const method of ["put", "patch"] as const) router[method]("/Groups/:id", async (c) => {
		const auth = c.get("scim"); const client = getDataClient(c.env); const id = c.req.param("id"); const action = method === "put" ? "scim.group.replaced" : "scim.group.patched";
		try { const service = groups(c); const body = await readScimJson(c.req.raw); const group = method === "put" ? await service.replace(id, body) : await service.patch(id, body); await writeScimAudit(client, c.req.raw, auth, { action, outcome: "success", status: 200, resourceType: "Group", resourceId: id }); return scimJson(group); }
		catch (error) { return auditError(client, c.req.raw, auth, action, error, "Group", id); }
	});

	router.delete("/Groups/:id", async (c) => {
		const auth = c.get("scim"); const client = getDataClient(c.env); const id = c.req.param("id");
		try { await groups(c).delete(id); await writeScimAudit(client, c.req.raw, auth, { action: "scim.group.deleted", outcome: "success", status: 204, resourceType: "Group", resourceId: id }); return new Response(null, { status: 204 }); }
		catch (error) { return auditError(client, c.req.raw, auth, "scim.group.deleted", error, "Group", id); }
	});

	router.post("/Bulk", async (c) => {
		const auth = c.get("scim"); const client = getDataClient(c.env);
		try {
			const payload = await readScimPayload(c.req.raw); const idempotencyKey = c.req.header("idempotency-key")?.trim();
			if (idempotencyKey && idempotencyKey.length > 200) throw new ScimProtocolError(400, "Idempotency-Key is too long.", "invalidValue");
			const requestHash = await sha256Hex(payload.raw);
			if (idempotencyKey) {
				const existing = await client.from("scim_idempotency_keys").select("request_hash,response_status,response_body,expires_at").eq("workspace_id", auth.workspaceId).eq("idempotency_key", idempotencyKey).gt("expires_at", new Date().toISOString()).maybeSingle();
				if (existing.error) throw new ScimProtocolError(503, "Bulk idempotency storage is unavailable.");
				if (existing.data?.request_hash !== undefined && existing.data.request_hash !== requestHash) throw new ScimProtocolError(409, "Idempotency-Key was already used for a different request.", "uniqueness");
				if (existing.data?.response_body) return scimJson(existing.data.response_body, existing.data.response_status ?? 200);
				if (existing.data) throw new ScimProtocolError(409, "An identical Bulk request is still running. Retry shortly.");
				await client.from("scim_idempotency_keys").delete().eq("workspace_id", auth.workspaceId).eq("idempotency_key", idempotencyKey).lte("expires_at", new Date().toISOString());
				const reserved = await client.from("scim_idempotency_keys").insert({ workspace_id: auth.workspaceId, idempotency_key: idempotencyKey, request_hash: requestHash });
				if (reserved.error) throw new ScimProtocolError(409, "An identical Bulk request is already running. Retry shortly.");
			}
			let response;
			try { response = await executeBulk(payload.body, { User: users(c), Group: groups(c) }, (event) => writeScimAudit(client, c.req.raw, auth, event)); }
			catch (error) { if (idempotencyKey) await client.from("scim_idempotency_keys").delete().eq("workspace_id", auth.workspaceId).eq("idempotency_key", idempotencyKey).eq("request_hash", requestHash).is("response_body", null); throw error; }
			if (idempotencyKey) {
				const stored = await client.from("scim_idempotency_keys").update({ response_status: 200, response_body: response }).eq("workspace_id", auth.workspaceId).eq("idempotency_key", idempotencyKey).eq("request_hash", requestHash);
				if (stored.error) console.error("[web-api/scim] bulk idempotency response store failed", { workspaceId: auth.workspaceId, requestHash, code: stored.error.code });
			}
			return scimJson(response);
		} catch (error) { return auditError(client, c.req.raw, auth, "scim.bulk.rejected", error); }
	});

	router.all("*", () => scimError(404, "Resource not found.", "noTarget"));
	return router;
}

async function readScimJson(request: Request): Promise<unknown> {
	return (await readScimPayload(request)).body;
}

async function readScimPayload(request: Request): Promise<{ raw: string; body: unknown }> {
	const length = Number(request.headers.get("content-length") ?? "0");
	if (Number.isFinite(length) && length > 1_048_576) throw new ScimProtocolError(413, "The request payload is too large.", "tooMany");
	const raw = await request.text();
	if (new TextEncoder().encode(raw).byteLength > 1_048_576) throw new ScimProtocolError(413, "The request payload is too large.", "tooMany");
	try { return { raw, body: JSON.parse(raw) as unknown }; } catch { throw new ScimProtocolError(400, "The request body must be valid JSON.", "invalidSyntax"); }
}

async function sha256Hex(value: string): Promise<string> {
	const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
	return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function protocolError(error: unknown): Response {
	if (error instanceof ScimProtocolError) return scimError(error.status, error.message, error.scimType);
	console.error("[web-api/scim] unhandled request error", error);
	return scimError(500, "The SCIM request could not be completed.");
}

async function auditError(client: ReturnType<typeof getDataClient>, request: Request, auth: ScimAuthContext, action: string, error: unknown, resourceType?: string, resourceId?: string) {
	const known = error instanceof ScimProtocolError ? error : new ScimProtocolError(500, "The SCIM request could not be completed.");
	await writeScimAudit(client, request, auth, { action, outcome: known.status === 401 || known.status === 403 ? "denied" : "failure", status: known.status, resourceType, resourceId, scimType: known.scimType, detail: known.message });
	if (!(error instanceof ScimProtocolError)) console.error("[web-api/scim] unhandled mutation error", error);
	return scimError(known.status, known.message, known.scimType);
}

export const scimRouter = createScimRouter();
