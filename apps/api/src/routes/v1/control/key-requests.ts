// API key requests: /v1/key-requests. How the CLI's coding-agent setup gets a key now that a CLI or app
// sign-in can't create one (POST /v1/keys refuses OAuth-client tokens: anyone can start a sign-in with
// the CLI's public client id, so its token can't be trusted to mint spending keys).
//
// * POST /v1/key-requests (create only): records what key the caller wants (name, spending caps,
//   lifetime) and a PKCE S256 code_challenge, and returns a dashboard approval_url. Nothing else is
//   created. Any OAuth token with keys:write may call it, including the CLI's and third-party apps'.
// * The person opens approval_url, signed in to the dashboard (not with an OAuth token), and approves or
//   denies. Approval creates the key with exactly the stored limits through the dashboard's key-creation
//   path in web-api (POST /api/account/settings/keys/requests/{id}/approve), and holds its secret
//   encrypted until pickup. There is no approve route here: the gateway API can't approve a request.
// * POST /v1/key-requests/{id}/token with the code_verifier: the person who made the request, through the
//   same OAuth client or management key and a token for the same workspace, holding the verifier, gets
//   the secret once (then it's wiped); otherwise pending, denied or expired. Polling
//   faster than every 2 seconds gets 429 slow_down, and five wrong verifiers deny the request.
import { Hono } from "hono";
import { CAPABILITIES } from "@/lib/authz/capabilities";
import { recordWorkspaceAuditEvent } from "@/lib/audit/workspaceAudit";
import { DESKTOP_CLIENT_ID, isFirstPartyCliClient } from "@/lib/oauth/clientIds";
import { loadOAuthClient } from "@/lib/oauth/service";
import { resolveKeyPepperCandidates } from "@/lib/security/keyPepper";
import { decryptKeyRequestSecret } from "@/lib/security/keyRequestSecret";
import { guardManagementAuth, type GuardErr } from "@/pipeline/before/guards";
import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import type { Env } from "@/runtime/types";
import { json, withRuntime } from "@/routes/utils";
import { canTargetOtherWorkspace, internalServerError, isResponse, requireCapability, requireJsonBody, type ManagementRouteAuth } from "./route-helpers";
import { isReservedKeyName } from "./management-helpers";

const NO_STORE = { "Cache-Control": "no-store" };
const DEFAULT_WEB_BASE_URL = "https://phaseo.app";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;

export const KEY_REQUEST_POLL_INTERVAL_SECONDS = 3;
export const KEY_REQUEST_TTL_SECONDS = 600;
export const KEY_REQUEST_MAX_OPEN = 5;
export const KEY_REQUEST_DEFAULT_LIFETIME_DAYS = 90;
export const KEY_REQUEST_MAX_LIFETIME_DAYS = 365;
/** A single cap above this is almost certainly a typo; larger keys are made in the dashboard. */
export const KEY_REQUEST_MAX_COST_USD = 100_000;

type RequestAuth = ManagementRouteAuth & { workspaceId: string; apiKeyId?: string; requestId?: string | null; internal?: boolean };

/**
 * The credential a request came from, which its pickup must come from too: the OAuth client (a refreshed
 * token of the same client still matches) or the management key. Another client the person signed in to
 * can't collect the key or use up its verifier attempts.
 */
function requesterCredential(auth: RequestAuth): string {
	if (auth.authMethod === "oauth") return `oauth:${String(auth.oauthClientId ?? "").trim() || auth.apiKeyRef || "session"}`;
	return `api_key:${String(auth.apiKeyId ?? "").trim() || auth.apiKeyRef || "unknown"}`;
}

function errorResponse(status: number, error: string, message: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
	return json({ ok: false, error, message, ...extra }, status, { ...NO_STORE, ...headers });
}

function webBaseUrl(): string {
	const configured = getBindings().PHASEO_WEB_BASE_URL?.trim();
	return (configured || DEFAULT_WEB_BASE_URL).replace(/\/+$/, "");
}

export function keyRequestApprovalUrl(id: string): string {
	return `${webBaseUrl()}/settings/keys/requests/${encodeURIComponent(id)}`;
}

function usdToNanos(value: number): number {
	return Math.round(value * 1_000_000_000);
}

function nanosToUsd(value: unknown): number | null {
	const nanos = Number(value ?? 0);
	return Number.isFinite(nanos) && nanos > 0 ? nanos / 1_000_000_000 : null;
}

function parseCap(raw: unknown, field: string): { ok: true; nanos: number } | { ok: false; message: string } {
	if (raw === undefined || raw === null) return { ok: true, nanos: 0 };
	const value = typeof raw === "string" && raw.trim() ? Number(raw) : raw;
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > KEY_REQUEST_MAX_COST_USD) {
		return { ok: false, message: `limits.${field} must be a number of US dollars above 0 and at most ${KEY_REQUEST_MAX_COST_USD}` };
	}
	return { ok: true, nanos: usdToNanos(value) };
}

type ParsedRequest = {
	name: string;
	agent: string | null;
	dailyCostNanos: number;
	monthlyCostNanos: number;
	lifetimeDays: number;
	codeChallenge: string;
};

export function parseKeyRequestBody(body: Record<string, unknown>): { ok: true; value: ParsedRequest } | { ok: false; message: string } {
	const name = typeof body.name === "string" ? body.name.trim() : "";
	if (!name || name.length > 120) return { ok: false, message: "name is required (at most 120 characters)" };
	if (isReservedKeyName(name)) return { ok: false, message: "This key name is reserved for keys Phaseo manages" };
	const agentRaw = body.agent ?? null;
	if (agentRaw !== null && (typeof agentRaw !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(agentRaw.trim()))) {
		return { ok: false, message: "agent must be a short identifier such as codex or claude-code" };
	}
	const limits = body.limits ?? {};
	if (!limits || typeof limits !== "object" || Array.isArray(limits)) return { ok: false, message: "limits must be an object" };
	const limitFields = limits as Record<string, unknown>;
	for (const field of Object.keys(limitFields)) {
		if (field !== "daily_cost_usd" && field !== "monthly_cost_usd") {
			return { ok: false, message: "limits accepts daily_cost_usd and monthly_cost_usd" };
		}
	}
	const daily = parseCap(limitFields.daily_cost_usd, "daily_cost_usd");
	if (daily.ok === false) return daily;
	const monthly = parseCap(limitFields.monthly_cost_usd, "monthly_cost_usd");
	if (monthly.ok === false) return monthly;
	if (daily.nanos === 0 && monthly.nanos === 0) {
		return { ok: false, message: "A key request needs a spending limit: limits.daily_cost_usd, limits.monthly_cost_usd or both" };
	}
	const lifetimeRaw = body.expires_in_days ?? KEY_REQUEST_DEFAULT_LIFETIME_DAYS;
	const lifetimeDays = typeof lifetimeRaw === "number" ? lifetimeRaw : Number.NaN;
	if (!Number.isInteger(lifetimeDays) || lifetimeDays < 1 || lifetimeDays > KEY_REQUEST_MAX_LIFETIME_DAYS) {
		return { ok: false, message: `expires_in_days must be a whole number from 1 to ${KEY_REQUEST_MAX_LIFETIME_DAYS}` };
	}
	const method = body.code_challenge_method ?? "S256";
	if (method !== "S256") return { ok: false, message: "code_challenge_method must be S256" };
	const codeChallenge = typeof body.code_challenge === "string" ? body.code_challenge.trim() : "";
	if (!CHALLENGE_PATTERN.test(codeChallenge)) {
		return { ok: false, message: "code_challenge must be the base64url SHA-256 of a code_verifier (43 characters)" };
	}
	return {
		ok: true,
		value: {
			name,
			agent: typeof agentRaw === "string" ? agentRaw.trim().toLowerCase() : null,
			dailyCostNanos: daily.nanos,
			monthlyCostNanos: monthly.nanos,
			lifetimeDays,
			codeChallenge,
		},
	};
}

/** base64url(SHA-256(verifier)), as in PKCE S256. */
export async function codeChallengeFor(verifier: string): Promise<string> {
	const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
	let binary = "";
	for (const byte of digest) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** The name the approval page shows for the app that asked. */
async function requestingAppName(auth: RequestAuth): Promise<string> {
	if (auth.authMethod !== "oauth") return "Management key";
	const clientId = String(auth.oauthClientId ?? "").trim();
	if (!clientId) return "Phaseo dashboard";
	if (isFirstPartyCliClient(clientId)) return "Phaseo CLI";
	if (clientId === DESKTOP_CLIENT_ID) return "Phaseo desktop app";
	const client = await loadOAuthClient(clientId).catch(() => null);
	const name = String(client?.name ?? "").trim();
	return (name || clientId).slice(0, 120);
}

function resolveWorkspace(auth: RequestAuth, requested: unknown): { ok: true; workspaceId: string } | { ok: false; response: Response } {
	if (requested !== undefined && requested !== null && typeof requested !== "string") {
		return { ok: false, response: errorResponse(400, "bad_request", "workspace_id must be a workspace id") };
	}
	const workspaceId = typeof requested === "string" ? requested.trim() : "";
	if (!workspaceId || workspaceId === auth.workspaceId) return { ok: true, workspaceId: auth.workspaceId };
	if (!UUID_PATTERN.test(workspaceId)) return { ok: false, response: errorResponse(400, "bad_request", "workspace_id must be a workspace id") };
	if (!auth.internal && !canTargetOtherWorkspace(auth)) {
		return { ok: false, response: errorResponse(403, "forbidden", "workspace_id must match authenticated workspace") };
	}
	return { ok: true, workspaceId };
}

function requireUser(auth: RequestAuth): string | Response {
	const userId = auth.userId?.trim();
	if (!userId) return errorResponse(403, "forbidden", "Key requests need a person to approve them: sign in with the Phaseo CLI or use a management key that belongs to a person.");
	return userId;
}

async function handleCreate(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return (auth as GuardErr).response;
	const caller = auth.value as RequestAuth;
	const scopeError = requireCapability(caller, CAPABILITIES.KEYS_WRITE);
	if (scopeError) return scopeError;
	const userId = requireUser(caller);
	if (isResponse(userId)) return userId;

	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	const parsed = parseKeyRequestBody(body);
	if (parsed.ok === false) return errorResponse(400, "bad_request", parsed.message);
	const workspace = resolveWorkspace(caller, body.workspace_id);
	if (workspace.ok === false) return workspace.response;

	try {
		const clientName = await requestingAppName(caller);
		const { data, error } = await getSupabaseAdmin().rpc("create_api_key_request", {
			p_workspace_id: workspace.workspaceId,
			p_user_id: userId,
			p_requested_via: caller.authMethod === "oauth" ? "oauth" : "management_key",
			p_oauth_client_id: caller.authMethod === "oauth" ? caller.oauthClientId ?? null : null,
			p_client_name: clientName,
			p_agent: parsed.value.agent,
			p_key_name: parsed.value.name,
			p_daily_cost_nanos: parsed.value.dailyCostNanos,
			p_monthly_cost_nanos: parsed.value.monthlyCostNanos,
			p_key_lifetime_days: parsed.value.lifetimeDays,
			p_code_challenge: parsed.value.codeChallenge,
			p_requester_credential: requesterCredential(caller),
			p_requester_workspace_id: caller.workspaceId,
			p_ttl_seconds: KEY_REQUEST_TTL_SECONDS,
			p_max_open: KEY_REQUEST_MAX_OPEN,
		});
		if (error) {
			const message = String(error.message ?? "");
			if (message.includes("api_key_request_forbidden")) {
				return errorResponse(403, "forbidden", "Only a workspace owner or admin can ask for an API key.");
			}
			if (message.includes("api_key_request_limit")) {
				return errorResponse(429, "too_many_requests", `You already have ${KEY_REQUEST_MAX_OPEN} key requests waiting in this workspace. Approve or deny them, or wait 10 minutes for them to expire.`);
			}
			throw error;
		}
		const row = (Array.isArray(data) ? data[0] : data) as { id?: string; expires_at?: string } | null;
		if (!row?.id) throw new Error("create_api_key_request returned no request");

		await recordWorkspaceAuditEvent(getSupabaseAdmin(), {
			workspaceId: workspace.workspaceId,
			actorUserId: userId,
			action: "api_key_request.created",
			targetType: "api_key_request",
			targetId: row.id,
			targetName: parsed.value.name,
			metadata: {
				client: clientName,
				oauth_client_id: caller.authMethod === "oauth" ? caller.oauthClientId ?? null : null,
				agent: parsed.value.agent,
				daily_cost_usd: nanosToUsd(parsed.value.dailyCostNanos),
				monthly_cost_usd: nanosToUsd(parsed.value.monthlyCostNanos),
				expires_in_days: parsed.value.lifetimeDays,
			},
			requestId: caller.requestId ?? null,
		});

		return json({
			request_id: row.id,
			status: "pending",
			approval_url: keyRequestApprovalUrl(row.id),
			poll_interval: KEY_REQUEST_POLL_INTERVAL_SECONDS,
			expires_in: KEY_REQUEST_TTL_SECONDS,
			expires_at: row.expires_at ?? null,
			workspace_id: workspace.workspaceId,
			name: parsed.value.name,
			limits: {
				daily_cost_usd: nanosToUsd(parsed.value.dailyCostNanos),
				monthly_cost_usd: nanosToUsd(parsed.value.monthlyCostNanos),
			},
			expires_in_days: parsed.value.lifetimeDays,
		}, 201, NO_STORE);
	} catch (error) {
		return internalServerError("key_requests.create", error);
	}
}

const STATUS_MESSAGES: Record<string, string> = {
	pending: "Waiting for approval in the browser.",
	denied: "The key request was denied in the dashboard. Nothing was created.",
	expired: "The key request expired before it was approved and collected. Start setup again to make a new one.",
	collected: "This key was already collected. Its secret is shown once; start setup again for a new key.",
};

async function handleCollect(req: Request) {
	const auth = await guardManagementAuth(req, { useKvCache: false });
	if (!auth.ok) return (auth as GuardErr).response;
	const caller = auth.value as RequestAuth;
	const scopeError = requireCapability(caller, CAPABILITIES.KEYS_WRITE);
	if (scopeError) return scopeError;
	const userId = requireUser(caller);
	if (isResponse(userId)) return userId;

	const id = new URL(req.url).pathname.split("/").filter(Boolean).at(-2) ?? "";
	if (!UUID_PATTERN.test(id)) return errorResponse(404, "not_found", "Key request not found");
	const body = await requireJsonBody(req);
	if (isResponse(body)) return body;
	const verifier = typeof body.code_verifier === "string" ? body.code_verifier.trim() : "";
	if (!VERIFIER_PATTERN.test(verifier)) {
		return errorResponse(400, "invalid_request", "code_verifier must be 43 to 128 characters of letters, digits, '-', '.', '_' or '~'");
	}

	try {
		const supabase = getSupabaseAdmin();
		const { data, error } = await supabase.rpc("collect_api_key_request", {
			p_request_id: id,
			p_user_id: userId,
			p_requester_credential: requesterCredential(caller),
			p_requester_workspace_id: caller.workspaceId,
			p_code_challenge: await codeChallengeFor(verifier),
		});
		if (error) throw error;
		const row = (Array.isArray(data) ? data[0] : data) as { outcome?: string; workspace_id?: string | null; key_id?: string | null; secret_ciphertext?: string | null } | null;
		const outcome = String(row?.outcome ?? "not_found");

		if (outcome === "not_found") return errorResponse(404, "not_found", "Key request not found");
		if (outcome === "slow_down") {
			return errorResponse(429, "slow_down", `Poll at most every ${KEY_REQUEST_POLL_INTERVAL_SECONDS} seconds.`, { poll_interval: KEY_REQUEST_POLL_INTERVAL_SECONDS }, { "Retry-After": String(KEY_REQUEST_POLL_INTERVAL_SECONDS) });
		}
		if (outcome === "invalid_verifier") return errorResponse(400, "invalid_verifier", "code_verifier does not match this request's code_challenge");
		if (outcome !== "approved") {
			return json({
				request_id: id,
				status: outcome,
				final: outcome !== "pending",
				message: STATUS_MESSAGES[outcome] ?? STATUS_MESSAGES.expired,
				...(outcome === "pending" ? { poll_interval: KEY_REQUEST_POLL_INTERVAL_SECONDS } : {}),
			}, 200, NO_STORE);
		}

		const peppers = resolveKeyPepperCandidates(getBindings()).map((candidate) => candidate.value);
		const secret = row?.secret_ciphertext ? await decryptKeyRequestSecret(peppers, id, row.secret_ciphertext) : null;
		if (!secret || !row?.key_id) throw new Error("approved key request secret could not be opened");
		const key = await supabase
			.from("keys")
			.select("id, workspace_id, name, prefix, expires_at, daily_limit_cost_nanos, monthly_limit_cost_nanos")
			.eq("id", row.key_id)
			.maybeSingle();
		if (key.error) throw key.error;
		const keyRow = (key.data ?? {}) as Record<string, unknown>;

		await recordWorkspaceAuditEvent(supabase, {
			workspaceId: String(row.workspace_id ?? caller.workspaceId),
			actorUserId: userId,
			action: "api_key_request.collected",
			targetType: "api_key",
			targetId: row.key_id,
			targetName: typeof keyRow.name === "string" ? keyRow.name : null,
			metadata: { request_id: id, oauth_client_id: caller.authMethod === "oauth" ? caller.oauthClientId ?? null : null },
			requestId: caller.requestId ?? null,
		});

		return json({
			request_id: id,
			status: "approved",
			final: true,
			key: secret,
			key_id: row.key_id,
			workspace_id: row.workspace_id ?? null,
			name: keyRow.name ?? null,
			prefix: keyRow.prefix ?? null,
			expires_at: keyRow.expires_at ?? null,
			limits: {
				daily_cost_usd: nanosToUsd(keyRow.daily_limit_cost_nanos),
				monthly_cost_usd: nanosToUsd(keyRow.monthly_limit_cost_nanos),
			},
		}, 200, NO_STORE);
	} catch (error) {
		return internalServerError("key_requests.collect", error);
	}
}

export const keyRequestsRoutes = new Hono<Env>();

keyRequestsRoutes.post("/", withRuntime(handleCreate));
keyRequestsRoutes.post("/:id/token", withRuntime(handleCollect));
