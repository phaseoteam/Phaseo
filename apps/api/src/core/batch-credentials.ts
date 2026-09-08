import { BYOK_KEYS_PER_PROVIDER_LIMIT, isByokKeyEligible } from "@/core/byok";
import { decryptBYOK, bytesToString } from "@pipeline/byok/decrypt";
import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import { resolveProviderKey } from "@providers/keys";
import { resolveOpenAICompatKey } from "@providers/openai-compatible/config";

export type ProviderCredentialMode = "managed_and_byok" | "byok_only";

export type BatchProviderCredential = {
	key: string;
	source: "gateway" | "byok";
	byokKeyId: string | null;
};

type StoredByokRow = Record<string, any> & { id: string; provider_id: string };

function rowMode(row: StoredByokRow): "priority" | "fallback" {
	return row.routing_mode === "priority" || row.routing_mode === "fallback"
		? row.routing_mode
		: row.always_use ? "priority" : "fallback";
}

function orderedRows(rows: StoredByokRow[]): StoredByokRow[] {
	return [...rows].sort((a, b) => {
		const aMode = rowMode(a);
		const bMode = rowMode(b);
		if (aMode !== bMode) return aMode === "priority" ? -1 : 1;
		return Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0) || a.id.localeCompare(b.id);
	});
}

async function decryptRow(row: StoredByokRow, workspaceId: string): Promise<BatchProviderCredential> {
	const bytes = await decryptBYOK({ ...row, workspace_id: workspaceId, provider_id: row.provider_id } as any);
	try {
		return { key: bytesToString(bytes), source: "byok", byokKeyId: row.id };
	} finally {
		bytes.fill(0);
	}
}

export async function getProviderCredentialMode(providerId: string, model?: string): Promise<ProviderCredentialMode> {
	if (model) {
		const route = await getSupabaseAdmin()
			.from("v2_model_provider_routes")
			.select("credential_mode")
			.eq("provider_slug", providerId)
			.eq("model_slug", model)
			.maybeSingle();
		if (route.error) throw new Error(`provider_credential_mode_unavailable:${route.error.message ?? "unknown"}`);
		if (route.data?.credential_mode === "byok_only") return "byok_only";
	}
	const { data, error } = await getSupabaseAdmin()
		.from("v2_providers")
		.select("credential_mode")
		.eq("provider_slug", providerId)
		.maybeSingle();
	if (error) throw new Error(`provider_credential_mode_unavailable:${error.message ?? "unknown"}`);
	return data?.credential_mode === "byok_only" ? "byok_only" : "managed_and_byok";
}

async function eligibleRows(args: {
	workspaceId: string;
	providerId: string;
	apiKeyId: string;
	model: string;
}): Promise<StoredByokRow[]> {
	const { data, error } = await getSupabaseAdmin()
		.from("byok_keys")
		.select("*")
		.eq("workspace_id", args.workspaceId)
		.eq("provider_id", args.providerId)
		.eq("enabled", true)
		.limit(BYOK_KEYS_PER_PROVIDER_LIMIT);
	if (error) throw new Error(`batch_byok_lookup_failed:${error.message ?? "unknown"}`);
	return orderedRows((data ?? []) as StoredByokRow[]).filter((row) => isByokKeyEligible({
		allowedModelSlugs: row.allowed_model_slugs,
		allowedApiKeyIds: row.allowed_api_key_ids,
		requestedModel: args.model,
		apiKeyId: args.apiKeyId,
	}));
}

function managedCredential(providerId: string): BatchProviderCredential | null {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	try {
		if (providerId === "anthropic") {
			const resolved = resolveProviderKey({ providerId, byokMeta: [], forceGatewayKey: true }, () => bindings.ANTHROPIC_API_KEY);
			return { key: resolved.key, source: "gateway", byokKeyId: null };
		}
		if (providerId === "google-ai-studio") {
			const key = bindings.GOOGLE_AI_STUDIO_API_KEY || bindings.GEMINI_API_KEY;
			return key ? { key, source: "gateway", byokKeyId: null } : null;
		}
		const resolved = resolveOpenAICompatKey({ providerId, byokMeta: [], forceGatewayKey: true } as any);
		return { key: resolved.key, source: "gateway", byokKeyId: null };
	} catch {
		return null;
	}
}

export async function resolveBatchSubmissionCredential(args: {
	workspaceId: string;
	providerId: string;
	apiKeyId: string;
	model: string;
}): Promise<{ credential: BatchProviderCredential; credentialMode: ProviderCredentialMode }> {
	const [credentialMode, rows] = await Promise.all([
		getProviderCredentialMode(args.providerId, args.model),
		eligibleRows(args),
	]);
	const priority = rows.find((row) => rowMode(row) === "priority");
	if (priority) return { credential: await decryptRow(priority, args.workspaceId), credentialMode };
	if (credentialMode !== "byok_only") {
		const managed = managedCredential(args.providerId);
		if (managed) return { credential: managed, credentialMode };
	}
	const fallback = rows.find((row) => rowMode(row) === "fallback");
	if (fallback) return { credential: await decryptRow(fallback, args.workspaceId), credentialMode };
	throw new Error(credentialMode === "byok_only" ? "byok_credentials_required" : "batch_provider_credentials_unavailable");
}

export async function reloadBatchCredential(args: {
	workspaceId: string;
	providerId: string;
	keySource?: "gateway" | "byok" | null;
	byokKeyId?: string | null;
}): Promise<BatchProviderCredential> {
	if (args.keySource !== "byok") {
		const managed = managedCredential(args.providerId);
		if (managed) return managed;
		throw new Error("batch_provider_credentials_unavailable");
	}
	if (!args.byokKeyId) throw new Error("batch_byok_credential_id_missing");
	const { data, error } = await getSupabaseAdmin().from("byok_keys").select("*")
		.eq("workspace_id", args.workspaceId).eq("provider_id", args.providerId)
		.eq("id", args.byokKeyId).eq("enabled", true).maybeSingle();
	if (error || !data) throw new Error("batch_byok_credential_unavailable");
	return decryptRow(data as StoredByokRow, args.workspaceId);
}
