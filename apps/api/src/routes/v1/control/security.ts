import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { getBindings, getCache, getSupabaseAdmin } from "@/runtime/env";
import { json, withRuntime } from "@/routes/utils";
import { setKeyVersion } from "@/core/kv";
import {
	resolveActiveKeyPepper,
	resolveKeyPepperCandidates,
	type KeyPepperCandidate,
} from "@/lib/security/keyPepper";

const enc = new TextEncoder();
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REPORTS = 30;

type KeyTableName = "keys" | "management_keys";
type SecurityReportStatus =
	| "received"
	| "matched"
	| "pending_review"
	| "auto_revoked"
	| "manually_revoked"
	| "dismissed"
	| "duplicate";
type ParsedGatewayKey = {
	kid: string;
	secret: string;
	prefix: string;
};
type KeyCandidate = {
	table: KeyTableName;
	id: string;
	workspace_id: string;
	name: string | null;
	prefix: string | null;
	status: string | null;
	hash: string;
	kid: string | null;
	soft_blocked?: boolean | null;
	revoked_at?: string | null;
	revoked_reason?: string | null;
};

function acceptedResponse() {
	return json({ status: "received" }, 202, { "Cache-Control": "no-store" });
}

function toTrimmedString(value: unknown, maxLength: number): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (!trimmed) return null;
	return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function toOptionalUrl(value: unknown, maxLength: number): string | null {
	const trimmed = toTrimmedString(value, maxLength);
	if (!trimmed) return null;
	try {
		const parsed = new URL(trimmed);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
		return parsed.toString().slice(0, maxLength);
	} catch {
		return null;
	}
}

function parseGatewayKey(token: string): ParsedGatewayKey | null {
	const parts = token.split("_");
	if (parts.length < 5) return null;
	const [namespace, version, kind, kid, ...rest] = parts;
	if (namespace !== "phaseo" && namespace !== "aistats") return null;
	if (version !== "v1" || kind !== "sk") return null;
	const secret = rest.join("_");
	if (!kid || !secret) return null;
	return {
		kid,
		secret,
		prefix: `${namespace}_v1_sk_${kid}`,
	};
}

function redactComment(comment: string | null, token: string | null): string | null {
	if (!comment) return null;
	if (!token) return comment;
	return comment.split(token).join("[redacted-token]");
}

function tokenPreview(parsed: ParsedGatewayKey | null): string | null {
	if (!parsed) return null;
	return `${parsed.prefix}...${parsed.secret.slice(-4)}`;
}

function resolveStoredReportStatus(args: {
	matched: boolean;
	actionTaken: string;
	mode: "auto_revoke" | "report_only";
}): SecurityReportStatus {
	if (args.actionTaken === "auto_revoked") return "auto_revoked";
	if (args.actionTaken === "matched_report_only") return "pending_review";
	if (args.actionTaken === "already_inactive") return "matched";
	if (args.matched) return args.mode === "report_only" ? "pending_review" : "matched";
	return "received";
}

function resolveReportMode(): "auto_revoke" | "report_only" {
	const raw = String(getBindings().LEAKED_KEY_REPORT_MODE ?? "").trim().toLowerCase();
	return raw === "report_only" ? "report_only" : "auto_revoke";
}

function deriveFirstNameFromMetadata(metadata: Record<string, unknown> | null | undefined): string {
	if (!metadata) return "";
	const candidates = [
		metadata.first_name,
		metadata.given_name,
		metadata.full_name,
		metadata.name,
	];
	for (const candidate of candidates) {
		const normalized = String(candidate ?? "").trim();
		if (!normalized) continue;
		return normalized.split(/\s+/)[0] ?? "";
	}
	return "";
}

function readClientIp(req: Request): string | null {
	const direct = req.headers.get("cf-connecting-ip")?.trim();
	if (direct) return direct;
	const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
	return forwarded || null;
}

async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", enc.encode(value));
	const bytes = new Uint8Array(digest);
	let hex = "";
	for (let i = 0; i < bytes.length; i++) {
		hex += bytes[i].toString(16).padStart(2, "0");
	}
	return hex;
}

async function hmacHexWithKeyBytes(message: string, keyBytes: Uint8Array): Promise<string> {
	const raw = new Uint8Array(keyBytes.byteLength);
	raw.set(keyBytes);

	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		raw.buffer,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);

	const mac = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(message));
	const bytes = new Uint8Array(mac);
	let hex = "";
	for (let i = 0; i < bytes.length; i++) {
		hex += bytes[i].toString(16).padStart(2, "0");
	}
	return hex;
}

function decodeHex(value: string): Uint8Array | null {
	if (!/^[0-9a-fA-F]+$/.test(value) || value.length % 2 !== 0) return null;
	const out = new Uint8Array(value.length / 2);
	for (let i = 0; i < out.length; i++) {
		out[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
	}
	return out;
}

function decodeBase64Url(value: string): Uint8Array | null {
	try {
		const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
		const binary = atob(b64);
		const out = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			out[i] = binary.charCodeAt(i);
		}
		return out;
	} catch {
		return null;
	}
}

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

async function secretMatchesStoredHash(secret: string, storedHash: string, pepper: string): Promise<boolean> {
	const utf8Digest = await hmacHexWithKeyBytes(secret, enc.encode(pepper));
	if (timingSafeEqual(utf8Digest, storedHash)) return true;

	const hexPepper = decodeHex(pepper);
	if (hexPepper) {
		const digest = await hmacHexWithKeyBytes(secret, hexPepper);
		if (timingSafeEqual(digest, storedHash)) return true;
	}

	const b64Pepper = decodeBase64Url(pepper);
	if (b64Pepper) {
		const digest = await hmacHexWithKeyBytes(secret, b64Pepper);
		if (timingSafeEqual(digest, storedHash)) return true;
	}

	return false;
}

async function findMatchingPepperCandidate(args: {
	secret: string;
	storedHash: string;
	pepperCandidates: KeyPepperCandidate[];
}): Promise<KeyPepperCandidate | null> {
	for (const candidate of args.pepperCandidates) {
		if (await secretMatchesStoredHash(args.secret, args.storedHash, candidate.value)) {
			return candidate;
		}
	}
	return null;
}

async function loadKeyCandidates(table: KeyTableName, kid: string): Promise<KeyCandidate[]> {
	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase
		.from(table)
		.select("id, workspace_id, name, prefix, status, hash, kid, soft_blocked, revoked_at, revoked_reason")
		.eq("kid", kid);
	if (error) {
		throw new Error(error.message || `Failed to load ${table}`);
	}
	return ((data ?? []) as any[]).map((row) => ({
		table,
		id: String(row.id),
		workspace_id: String(row.workspace_id),
		name: typeof row.name === "string" ? row.name : null,
		prefix: typeof row.prefix === "string" ? row.prefix : null,
		status: typeof row.status === "string" ? row.status : null,
		hash: String(row.hash ?? ""),
		kid: typeof row.kid === "string" ? row.kid : null,
		soft_blocked: Boolean(row.soft_blocked),
		revoked_at: typeof row.revoked_at === "string" ? row.revoked_at : null,
		revoked_reason: typeof row.revoked_reason === "string" ? row.revoked_reason : null,
	}));
}

async function findMatchedKey(parsed: ParsedGatewayKey): Promise<KeyCandidate | null> {
	const bindings = getBindings();
	const activePepper = resolveActiveKeyPepper(bindings);
	const pepperCandidates = resolveKeyPepperCandidates(bindings);
	if (!activePepper || pepperCandidates.length === 0) {
		return null;
	}

	const candidates = [
		...(await loadKeyCandidates("keys", parsed.kid)),
		...(await loadKeyCandidates("management_keys", parsed.kid)),
	];

	for (const candidate of candidates) {
		const matched = await findMatchingPepperCandidate({
			secret: parsed.secret,
			storedHash: candidate.hash.toLowerCase().trim(),
			pepperCandidates,
		});
		if (matched) return candidate;
	}

	return null;
}

async function invalidateGatewayKeyCache(candidate: KeyCandidate): Promise<void> {
	if (candidate.table !== "keys") return;
	const nowVersion = Date.now();
	await setKeyVersion("id", candidate.id, nowVersion);
	if (candidate.kid) {
		await setKeyVersion("kid", candidate.kid, nowVersion);
		await getCache().delete(`gateway:key:${candidate.kid}`);
	}
}

async function applyLeakedKeyRevocation(candidate: KeyCandidate): Promise<void> {
	const supabase = getSupabaseAdmin();
	const { error } = await supabase
		.from(candidate.table)
		.update({
			status: "compromised",
			soft_blocked: true,
			revoked_at: new Date().toISOString(),
			revoked_reason: "public_leak_report",
		})
		.eq("id", candidate.id)
		.eq("workspace_id", candidate.workspace_id);
	if (error) {
		throw new Error(error.message || `Failed to revoke leaked ${candidate.table} entry`);
	}
	await invalidateGatewayKeyCache(candidate);
}

async function enqueueOwnerNotifications(args: {
	workspaceId: string;
	keyType: "api_key" | "management_key";
	keyName: string | null;
	keyPreview: string | null;
	source: string | null;
	evidenceUrl: string | null;
	autoRevoked: boolean;
}): Promise<void> {
	const supabase = getSupabaseAdmin();
	const { data: workspaceRow } = await supabase
		.from("workspaces")
		.select("id, name, owner_user_id")
		.eq("id", args.workspaceId)
		.maybeSingle();

	const workspaceName =
		typeof (workspaceRow as any)?.name === "string" && (workspaceRow as any).name.trim()
			? (workspaceRow as any).name.trim()
			: "your workspace";
	const ownerUserId =
		typeof (workspaceRow as any)?.owner_user_id === "string" && (workspaceRow as any).owner_user_id.trim()
			? (workspaceRow as any).owner_user_id.trim()
			: null;

	const { data: membershipRows } = await supabase
		.from("workspace_members")
		.select("user_id, role")
		.eq("workspace_id", args.workspaceId);

	const recipientIds = new Set<string>();
	for (const row of (membershipRows ?? []) as any[]) {
		const role = String(row?.role ?? "").trim().toLowerCase();
		const userId = String(row?.user_id ?? "").trim();
		if (!userId) continue;
		if (role === "owner" || role === "admin") {
			recipientIds.add(userId);
		}
	}
	if (ownerUserId) recipientIds.add(ownerUserId);
	if (!recipientIds.size) return;

	const outboxRows: Array<Record<string, unknown>> = [];
	for (const userId of recipientIds) {
		try {
			const userRes = await (supabase as any).auth.admin.getUserById(userId);
			const email = String(userRes?.data?.user?.email ?? "").trim();
			if (!email) continue;
			const metadata = (userRes?.data?.user?.user_metadata ?? null) as Record<string, unknown> | null;
			outboxRows.push({
				kind: "security_leaked_key",
				template: "security_leaked_key",
				to_email: email,
				subject: args.autoRevoked
					? "Security alert: exposed API key revoked"
					: "Security alert: exposed API key reported",
				workspace_id: args.workspaceId,
				user_id: userId,
				payload: {
					user_first_name: deriveFirstNameFromMetadata(metadata) || "there",
					workspace_name: workspaceName,
					key_type: args.keyType,
					key_name: args.keyName,
					key_preview: args.keyPreview,
					reported_source: args.source,
					evidence_url: args.evidenceUrl,
					auto_revoked: args.autoRevoked,
				},
			});
		} catch {
			// Ignore individual lookup failures to keep notification best-effort.
		}
	}

	if (!outboxRows.length) return;
	await supabase.from("email_outbox").insert(outboxRows as any);
}

async function persistSecurityReport(payload: Record<string, unknown>): Promise<void> {
	try {
		await getSupabaseAdmin().from("security_key_reports").insert(payload as any);
	} catch (error) {
		console.error("security_key_report_persist_failed", {
			message: error instanceof Error ? error.message : String(error),
		});
	}
}

async function applyRateLimit(ipHash: string | null): Promise<boolean> {
	if (!ipHash) return false;
	try {
		const cache = getCache();
		const key = `security:key-report:${ipHash}`;
		const current = Number.parseInt((await cache.get(key)) ?? "0", 10);
		if (Number.isFinite(current) && current >= RATE_LIMIT_MAX_REPORTS) {
			return true;
		}
		await cache.put(key, String(Number.isFinite(current) ? current + 1 : 1), {
			expirationTtl: RATE_LIMIT_WINDOW_SECONDS,
		});
	} catch {
		// Fail open if KV is unavailable.
	}
	return false;
}

async function handleReportLeakedKey(req: Request) {
	const mode = resolveReportMode();
	const ipHash = readClientIp(req) ? await sha256Hex(String(readClientIp(req))) : null;
	const userAgentHash = req.headers.get("user-agent")?.trim()
		? await sha256Hex(String(req.headers.get("user-agent")))
		: null;

	let body: Record<string, unknown> = {};
	try {
		body = (await req.json()) as Record<string, unknown>;
	} catch {
		await persistSecurityReport({
			status: "received",
			source: null,
			reporter_email: null,
			evidence_url: null,
			comment: null,
			token_prefix: null,
			token_last_four: null,
			token_fingerprint: null,
			matched: false,
			key_table: null,
			api_key_id: null,
			workspace_id: null,
			action_taken: "invalid_json",
			report_mode: mode,
			ip_hash: ipHash,
			user_agent_hash: userAgentHash,
		});
		return acceptedResponse();
	}

	const token = toTrimmedString(body.token, 4096);
	const source = toTrimmedString(body.source, 64);
	const reporterEmail = toTrimmedString(body.reporter_email, 320);
	const evidenceUrl = toOptionalUrl(body.evidence_url, 2048);
	const comment = redactComment(toTrimmedString(body.comment, 2000), token);

	if (await applyRateLimit(ipHash)) {
		await persistSecurityReport({
			status: "received",
			source,
			reporter_email: reporterEmail,
			evidence_url: evidenceUrl,
			comment,
			token_prefix: null,
			token_last_four: null,
			token_fingerprint: token ? await sha256Hex(token) : null,
			matched: false,
			key_table: null,
			api_key_id: null,
			workspace_id: null,
			action_taken: "rate_limited",
			report_mode: mode,
			ip_hash: ipHash,
			user_agent_hash: userAgentHash,
		});
		return acceptedResponse();
	}

	if (!token) {
		await persistSecurityReport({
			status: "received",
			source,
			reporter_email: reporterEmail,
			evidence_url: evidenceUrl,
			comment,
			token_prefix: null,
			token_last_four: null,
			token_fingerprint: null,
			matched: false,
			key_table: null,
			api_key_id: null,
			workspace_id: null,
			action_taken: "missing_token",
			report_mode: mode,
			ip_hash: ipHash,
			user_agent_hash: userAgentHash,
		});
		return acceptedResponse();
	}

	const parsed = parseGatewayKey(token);
	const tokenFingerprint = await sha256Hex(token);
	if (!parsed) {
		await persistSecurityReport({
			status: "received",
			source,
			reporter_email: reporterEmail,
			evidence_url: evidenceUrl,
			comment,
			token_prefix: null,
			token_last_four: null,
			token_fingerprint: tokenFingerprint,
			matched: false,
			key_table: null,
			api_key_id: null,
			workspace_id: null,
			action_taken: "invalid_format",
			report_mode: mode,
			ip_hash: ipHash,
			user_agent_hash: userAgentHash,
		});
		return acceptedResponse();
	}

	let matchedKey: KeyCandidate | null = null;
	let actionTaken = "no_match";
	const actionTakenAt = new Date().toISOString();
	try {
		matchedKey = await findMatchedKey(parsed);
		if (matchedKey) {
			const status = String(matchedKey.status ?? "").trim().toLowerCase();
			const isActive = status === "active" && !matchedKey.soft_blocked;
			if (isActive && mode === "auto_revoke") {
				await applyLeakedKeyRevocation(matchedKey);
				actionTaken = "auto_revoked";
			} else if (isActive) {
				actionTaken = "matched_report_only";
			} else {
				actionTaken = "already_inactive";
			}
		}

		await persistSecurityReport({
			status: resolveStoredReportStatus({
				matched: Boolean(matchedKey),
				actionTaken,
				mode,
			}),
			source,
			reporter_email: reporterEmail,
			evidence_url: evidenceUrl,
			comment,
			token_prefix: parsed.prefix,
			token_last_four: parsed.secret.slice(-4),
			token_fingerprint: tokenFingerprint,
			matched: Boolean(matchedKey),
			key_table: matchedKey?.table ?? null,
			api_key_id: matchedKey?.id ?? null,
			workspace_id: matchedKey?.workspace_id ?? null,
			action_taken: actionTaken,
			action_taken_at: actionTaken !== "no_match" ? actionTakenAt : null,
			action_taken_by: null,
			report_mode: mode,
			ip_hash: ipHash,
			user_agent_hash: userAgentHash,
		});

		if (matchedKey && (actionTaken === "auto_revoked" || actionTaken === "matched_report_only")) {
			await enqueueOwnerNotifications({
				workspaceId: matchedKey.workspace_id,
				keyType: matchedKey.table === "management_keys" ? "management_key" : "api_key",
				keyName: matchedKey.name,
				keyPreview: tokenPreview(parsed),
				source,
				evidenceUrl,
				autoRevoked: actionTaken === "auto_revoked",
			});
		}
	} catch (error) {
		await persistSecurityReport({
			status: "received",
			source,
			reporter_email: reporterEmail,
			evidence_url: evidenceUrl,
			comment,
			token_prefix: parsed.prefix,
			token_last_four: parsed.secret.slice(-4),
			token_fingerprint: tokenFingerprint,
			matched: Boolean(matchedKey),
			key_table: matchedKey?.table ?? null,
			api_key_id: matchedKey?.id ?? null,
			workspace_id: matchedKey?.workspace_id ?? null,
			action_taken: "processing_error",
			action_taken_at: actionTakenAt,
			action_taken_by: null,
			report_mode: mode,
			ip_hash: ipHash,
			user_agent_hash: userAgentHash,
		});
		console.error("security_key_report_processing_failed", {
			message: error instanceof Error ? error.message : String(error),
		});
	}

	return acceptedResponse();
}

export const securityRoutes = new Hono<Env>();

securityRoutes.post("/report-leaked-key", withRuntime(handleReportLeakedKey));
