import crypto from "crypto";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { hmacSecret } from "@/lib/keygen";
import { CHAT_MANAGED_KEY_NAME } from "@/lib/gateway/managed-chat-key";
import { resolveActiveKeyPepper } from "@/lib/server/keyPepper";

const KEY_PREFIX = "aistats_v1_sk_";
const BASE62 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const DEFAULT_GATEWAY_API_URL = "http://localhost:8787";
const FORCE_CHAT_HASH_SYNC_FLAG = "CHAT_ROUTE_FORCE_HASH_SYNC";

type ChatGatewayContext = {
	userId: string;
	workspaceId: string;
	apiKey: string;
};

export class ChatGatewayAuthError extends Error {
	status: number;
	code: string;

	constructor(status: number, code: string, message: string) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

function deriveBase62Token(input: string, length: number): string {
	let out = "";
	let counter = 0;
	while (out.length < length) {
		const digest = crypto
			.createHash("sha256")
			.update(`${input}:${counter}`)
			.digest();
		for (const byte of digest) {
			out += BASE62[byte % BASE62.length];
			if (out.length >= length) break;
		}
		counter += 1;
	}
	return out.slice(0, length);
}

function resolveSeed(): string {
	const seed = String(
		process.env.CHAT_ROUTE_KEY_SEED ??
			process.env.KEY_PEPPER_ACTIVE ??
			process.env.KEY_PEPPER ??
			"",
	).trim();
	if (!seed) {
		throw new ChatGatewayAuthError(
			503,
			"chat_key_seed_missing",
			"Chat route key seed is not configured",
		);
	}
	return seed;
}

function resolvePepper(): string {
	try {
		return resolveActiveKeyPepper();
	} catch {
		throw new ChatGatewayAuthError(
			503,
			"key_pepper_missing",
			"Gateway key pepper is not configured",
		);
	}
}

function shouldForceChatHashSync(): boolean {
	const raw = String(process.env[FORCE_CHAT_HASH_SYNC_FLAG] ?? "").trim().toLowerCase();
	return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function deriveTeamScopedGatewayKey(args: { workspaceId: string }): {
	kid: string;
	secret: string;
	plaintext: string;
	prefix: string;
} {
	const seed = resolveSeed();
	const kid = deriveBase62Token(`${seed}:kid:${args.workspaceId}`, 12);
	const secret = deriveBase62Token(`${seed}:secret:${args.workspaceId}`, 40);
	return {
		kid,
		secret,
		plaintext: `${KEY_PREFIX}${kid}_${secret}`,
		prefix: kid.slice(0, 6),
	};
}

async function findTeamIdForUser(userId: string): Promise<string> {
	const supabase = await createClient();
	const cookieStore = await cookies();
	const cookieTeamId = String(cookieStore.get("activeWorkspaceId")?.value ?? "").trim();

	const isMember = async (workspaceId: string): Promise<boolean> => {
		if (!workspaceId) return false;
		const { data, error } = await supabase
			.from("workspace_members")
			.select("workspace_id")
			.eq("user_id", userId)
			.eq("workspace_id", workspaceId)
			.limit(1)
			.maybeSingle();
		if (!error && data?.workspace_id) return true;

		const { data: ownedWorkspace, error: ownerError } = await supabase
			.from("workspaces")
			.select("id")
			.eq("id", workspaceId)
			.eq("owner_user_id", userId)
			.limit(1)
			.maybeSingle();
		return !ownerError && Boolean(ownedWorkspace?.id);
	};

	if (cookieTeamId && (await isMember(cookieTeamId))) {
		return cookieTeamId;
	}

	const { data: userRow } = await supabase
		.from("users")
		.select("default_workspace_id")
		.eq("user_id", userId)
		.maybeSingle();
	const defaultWorkspaceId = String(userRow?.default_workspace_id ?? "").trim();
	if (defaultWorkspaceId && (await isMember(defaultWorkspaceId))) {
		return defaultWorkspaceId;
	}

	const [{ data: membershipRow }, { data: ownedWorkspace }] = await Promise.all([
		supabase
			.from("workspace_members")
			.select("workspace_id")
			.eq("user_id", userId)
			.limit(1)
			.maybeSingle(),
		supabase
			.from("workspaces")
			.select("id")
			.eq("owner_user_id", userId)
			.limit(1)
			.maybeSingle(),
	]);

	const fallbackWorkspaceId =
		String(membershipRow?.workspace_id ?? "").trim() ||
		String(ownedWorkspace?.id ?? "").trim();
	if (!fallbackWorkspaceId) {
		throw new ChatGatewayAuthError(
			403,
			"no_workspace_membership",
			"You must be a member of a team to use chat",
		);
	}
	return fallbackWorkspaceId;
}

async function ensureManagedGatewayKey(args: {
	workspaceId: string;
	userId: string;
}): Promise<string> {
	const admin = createAdminClient();
	const pepper = resolvePepper();
	const derived = deriveTeamScopedGatewayKey({ workspaceId: args.workspaceId });
	const expectedHash = hmacSecret(derived.secret, pepper);

	const { data: existing, error: selectError } = await admin
		.from("keys")
		.select("id, workspace_id, status, hash")
		.eq("kid", derived.kid)
		.maybeSingle();
	if (selectError) {
		throw new ChatGatewayAuthError(
			500,
			"chat_key_lookup_failed",
			selectError.message,
		);
	}

	if (!existing) {
		const { error: insertError } = await admin.from("keys").insert({
			workspace_id: args.workspaceId,
			name: CHAT_MANAGED_KEY_NAME,
			kid: derived.kid,
			hash: expectedHash,
			prefix: derived.prefix,
			status: "active",
			scopes: "[]",
			created_by: args.userId,
			daily_limit_requests: 0,
			weekly_limit_requests: 0,
			monthly_limit_requests: 0,
			daily_limit_cost_nanos: 0,
			weekly_limit_cost_nanos: 0,
			monthly_limit_cost_nanos: 0,
		});
		if (insertError) {
			const code = String((insertError as { code?: unknown } | null)?.code ?? "");
			// Another concurrent request may have created the same deterministic key.
			if (code === "23505") {
				const { data: concurrentRow, error: concurrentError } = await admin
					.from("keys")
					.select("id")
					.eq("hash", expectedHash)
					.eq("workspace_id", args.workspaceId)
					.limit(1)
					.maybeSingle();
				if (!concurrentError && concurrentRow?.id) {
					return derived.plaintext;
				}
			}
			throw new ChatGatewayAuthError(
				500,
				"chat_key_create_failed",
				insertError.message,
			);
		}
		return derived.plaintext;
	}

	if (String(existing.workspace_id) !== args.workspaceId) {
		throw new ChatGatewayAuthError(
			500,
			"chat_key_collision",
			"Managed chat key is bound to a different team",
		);
	}

	const updates: Record<string, unknown> = {};
	if (String(existing.status) !== "active") {
		updates.status = "active";
	}

	// Do not rewrite hash by default: during pepper rotations, Vercel and
	// Cloudflare can briefly diverge. Forcing hash rewrites on each request can
	// create auth flapping. Only sync hashes when explicitly requested.
	if (shouldForceChatHashSync()) {
		const storedHash = String(existing.hash ?? "").toLowerCase().trim();
		if (storedHash !== expectedHash) {
			updates.hash = expectedHash;
		}
	}

	if (Object.keys(updates).length > 0) {
		const { error: updateError } = await admin
			.from("keys")
			.update(updates)
			.eq("id", existing.id)
			.eq("workspace_id", args.workspaceId);
		if (updateError) {
			throw new ChatGatewayAuthError(
				500,
				"chat_key_update_failed",
				updateError.message,
			);
		}
		await invalidateGatewayKeyCache(String(existing.id));
	}

	return derived.plaintext;
}

async function invalidateGatewayKeyCache(keyId: string): Promise<void> {
	const controlKey = String(
		process.env.GATEWAY_CONTROL_KEY ?? process.env.AI_STATS_GATEWAY_KEY ?? "",
	).trim();
	const controlSecret = String(process.env.GATEWAY_CONTROL_SECRET ?? "").trim();
	if (!controlKey || !controlSecret) return;

	const baseUrl = String(
		process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_GATEWAY_API_URL,
	).trim();
	if (!baseUrl) return;

	try {
		await fetch(
			`${baseUrl.replace(/\/+$/, "")}/v1/keys/${encodeURIComponent(keyId)}/invalidate`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${controlKey}`,
					"x-control-secret": controlSecret,
				},
				cache: "no-store",
			},
		);
	} catch {
		// Best-effort invalidation only.
	}
}

export async function resolveChatGatewayContext(): Promise<ChatGatewayContext> {
	const supabase = await createClient();
	const {
		data: { user },
		error: authError,
	} = await supabase.auth.getUser();

	if (authError || !user?.id) {
		throw new ChatGatewayAuthError(
			401,
			"unauthorized",
			"Sign in is required to use chat",
		);
	}

	const workspaceId = await findTeamIdForUser(user.id);
	const apiKey = await ensureManagedGatewayKey({ workspaceId, userId: user.id });

	return {
		userId: user.id,
		workspaceId,
		apiKey,
	};
}
