import { getSupabaseAdmin } from "@/runtime/env";
import { sendDiscordTextMessage } from "./discord";
import { readBindingEnv } from "./helpers";
import { syncUpstreamDiscoveryIssues, type UpstreamDiscoveryIssueEntry } from "./github-issues";

type HuggingFaceSeenRow = {
	org_id: string;
	model_id: string;
};

type HuggingFaceOrgDiff = {
	orgId: string;
	addedModelIds: string[];
	removedModelIds: string[];
};

type HuggingFaceDiscoveryResult =
	| {
			orgId: string;
			status: "success";
			modelCount: number;
			diff: HuggingFaceOrgDiff | null;
	  }
	| {
			orgId: string;
			status: "error";
			reason: string;
	  };

export type HuggingFaceDiscoverySummary = {
	enabled: boolean;
	executed: boolean;
	baselineInitialized: boolean;
	orgsConfigured: number;
	orgsSucceeded: number;
	orgsError: number;
	additionsDetected: number;
	removalsDetected: number;
	notified: boolean;
	issueSync?: {
		created: number;
		updated: number;
		skipped: boolean;
		reason?: string | null;
		error?: string | null;
	};
	skippedReason?: string | null;
	notificationError?: string | null;
	results: HuggingFaceDiscoveryResult[];
};

const PAGE_SIZE = 100;
const MAX_PAGES = 50;
const UPSERT_BATCH_SIZE = 500;
const HUGGING_FACE_BASE_URL = "https://huggingface.co";
const WATCHED_HF_ORGS = [
	"primeintellect",
	"voyageai",
	"arcee-ai",
	"apple",
	"baidu",
	"suno",
	"perplexity-ai",
	"moonshotai",
	"elevenlabs",
	"cohere",
	"anthropic",
	"amazon",
	"ai21labs",
	"ai-stats",
	"ibm-granite",
	"nousresearch",
	"bytedance-seed",
	"minimaxai",
	"microsoft",
	"xai-org",
	"zai-org",
	"lgai-exaone",
	"mistralai",
	"meta-llama",
	"nvidia",
	"google",
	"openai",
	"deepseek-ai",
	"qwen",
];

function trimOrNull(value: string | null | undefined): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed || null;
}

function parseNextLink(linkHeader: string | null): string | null {
	if (!linkHeader) return null;
	for (const part of linkHeader.split(",")) {
		const section = part.trim();
		if (!section.includes('rel="next"')) continue;
		const start = section.indexOf("<");
		const end = section.indexOf(">");
		if (start === -1 || end === -1 || end <= start + 1) continue;
		return section.slice(start + 1, end);
	}
	return null;
}

async function fetchHuggingFaceOrgModelIds(orgId: string, hfToken: string | null): Promise<string[]> {
	const headers: Record<string, string> = {};
	if (hfToken) {
		headers.Authorization = `Bearer ${hfToken}`;
	}

	const discovered = new Set<string>();
	let nextUrl = `${HUGGING_FACE_BASE_URL}/api/models?author=${encodeURIComponent(orgId)}&limit=${PAGE_SIZE}&full=false&config=false&cardData=false`;
	let pageCount = 0;

	while (nextUrl && pageCount < MAX_PAGES) {
		const response = await fetch(nextUrl, { headers });
		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(`Hugging Face API HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
		}

		const payload = (await response.json()) as unknown;
		if (!Array.isArray(payload)) {
			throw new Error("Hugging Face API payload is not an array.");
		}

		for (const item of payload) {
			if (!item || typeof item !== "object") continue;
			const row = item as Record<string, unknown>;
			const modelId =
				typeof row.id === "string" && row.id.trim()
					? row.id.trim()
					: typeof row.modelId === "string" && row.modelId.trim()
						? row.modelId.trim()
						: null;
			if (modelId) discovered.add(modelId);
		}

		nextUrl = parseNextLink(response.headers.get("link"));
		pageCount += 1;
	}

	if (nextUrl) {
		console.warn(`[model-discovery][hf] Org '${orgId}' reached pagination cap (${MAX_PAGES} pages).`);
	}

	return Array.from(discovered.values()).sort((left, right) => left.localeCompare(right));
}

async function loadPreviousHuggingFaceState(orgIds: string[]): Promise<Map<string, Set<string>>> {
	const map = new Map<string, Set<string>>();
	for (const orgId of orgIds) {
		map.set(orgId, new Set<string>());
	}
	if (orgIds.length === 0) return map;

	const supabase = getSupabaseAdmin();
	const { data, error } = await supabase
		.from("model_discovery_hf_seen_models")
		.select("org_id,model_id")
		.in("org_id", orgIds);

	if (error) {
		throw new Error(error.message || "Failed to load previous Hugging Face discovery state");
	}

	for (const row of (data ?? []) as HuggingFaceSeenRow[]) {
		const orgId = trimOrNull(row.org_id);
		const modelId = trimOrNull(row.model_id);
		if (!orgId || !modelId) continue;
		const existing = map.get(orgId) ?? new Set<string>();
		existing.add(modelId);
		map.set(orgId, existing);
	}

	return map;
}

async function upsertCurrentHuggingFaceState(entries: Array<{ org_id: string; model_id: string; last_seen_at: string }>): Promise<void> {
	if (entries.length === 0) return;
	const supabase = getSupabaseAdmin();

	for (let index = 0; index < entries.length; index += UPSERT_BATCH_SIZE) {
		const batch = entries.slice(index, index + UPSERT_BATCH_SIZE);
		const { error } = await supabase
			.from("model_discovery_hf_seen_models")
			.upsert(batch, { onConflict: "org_id,model_id" });
		if (error) {
			throw new Error(error.message || "Failed to persist Hugging Face discovery state");
		}
	}
}

async function deleteRemovedHuggingFaceState(entries: Array<{ orgId: string; modelIds: string[] }>): Promise<void> {
	if (entries.length === 0) return;
	const supabase = getSupabaseAdmin();

	for (const entry of entries) {
		for (let index = 0; index < entry.modelIds.length; index += UPSERT_BATCH_SIZE) {
			const batch = entry.modelIds.slice(index, index + UPSERT_BATCH_SIZE);
			const { error } = await supabase
				.from("model_discovery_hf_seen_models")
				.delete()
				.eq("org_id", entry.orgId)
				.in("model_id", batch);
			if (error) {
				throw new Error(error.message || "Failed to delete removed Hugging Face discovery rows");
			}
		}
	}
}

function buildDiscordMessage(diffs: HuggingFaceOrgDiff[]): string {
	const totalChanges = diffs.reduce((sum, diff) => sum + diff.addedModelIds.length + diff.removedModelIds.length, 0);
	const lines: string[] = [
		`External model discovery detected Hugging Face changes (${totalChanges} model event${totalChanges === 1 ? "" : "s"} across ${diffs.length} org${diffs.length === 1 ? "" : "s"}).`,
		"",
	];

	for (const diff of diffs) {
		lines.push(`${diff.orgId}`);
		if (diff.addedModelIds.length > 0) {
			lines.push(`Added (${diff.addedModelIds.length}):`);
			for (const modelId of diff.addedModelIds.slice(0, 20)) {
				lines.push(`- ${modelId} <${HUGGING_FACE_BASE_URL}/${modelId}>`);
			}
			if (diff.addedModelIds.length > 20) {
				lines.push(`- ...and ${diff.addedModelIds.length - 20} more`);
			}
		}
		if (diff.removedModelIds.length > 0) {
			lines.push(`Removed (${diff.removedModelIds.length}):`);
			for (const modelId of diff.removedModelIds.slice(0, 20)) {
				lines.push(`- ${modelId}`);
			}
			if (diff.removedModelIds.length > 20) {
				lines.push(`- ...and ${diff.removedModelIds.length - 20} more`);
			}
		}
		lines.push("");
	}

	const message = lines.join("\n").trim();
	return message.length <= 1900 ? message : `${message.slice(0, 1890)}\n...[truncated]`;
}

function buildIssueEntries(diffs: HuggingFaceOrgDiff[], detectedAt: string, detectionSource: string): UpstreamDiscoveryIssueEntry[] {
	const out: UpstreamDiscoveryIssueEntry[] = [];

	for (const diff of diffs) {
		for (const modelId of diff.addedModelIds) {
			out.push({
				source: "huggingface",
				providerId: diff.orgId,
				providerName: diff.orgId,
				action: "create",
				modelId,
				modelUrl: `${HUGGING_FACE_BASE_URL}/${modelId}`,
				detectedAt,
				detectionSource,
				reason: "Detected from watched Hugging Face organisation",
			});
		}
		for (const modelId of diff.removedModelIds) {
			out.push({
				source: "huggingface",
				providerId: diff.orgId,
				providerName: diff.orgId,
				action: "delete",
				modelId,
				modelUrl: `${HUGGING_FACE_BASE_URL}/${modelId}`,
				detectedAt,
				detectionSource,
				reason: "Removed from watched Hugging Face organisation",
			});
		}
	}

	return out;
}

export async function runHuggingFaceDiscovery(): Promise<HuggingFaceDiscoverySummary> {
	const orgIds = WATCHED_HF_ORGS;
	if (orgIds.length === 0) {
		return {
			enabled: true,
			executed: false,
			baselineInitialized: false,
			orgsConfigured: 0,
			orgsSucceeded: 0,
			orgsError: 0,
			additionsDetected: 0,
			removalsDetected: 0,
			notified: false,
			skippedReason: "no watched Hugging Face orgs configured",
			results: [],
		};
	}

	const previousByOrg = await loadPreviousHuggingFaceState(orgIds);
	const hfToken = trimOrNull(readBindingEnv(["HF_TOKEN"]));
	const detectedAt = new Date().toISOString();
	const currentByOrg = new Map<string, string[]>();
	const diffs: HuggingFaceOrgDiff[] = [];
	const results: HuggingFaceDiscoveryResult[] = [];
	let baselineInitialized = false;

	for (const orgId of orgIds) {
		try {
			const currentModelIds = await fetchHuggingFaceOrgModelIds(orgId, hfToken);
			currentByOrg.set(orgId, currentModelIds);
			const previousModelIds = previousByOrg.get(orgId) ?? new Set<string>();
			if (previousModelIds.size === 0 && currentModelIds.length > 0) {
				baselineInitialized = true;
				results.push({
					orgId,
					status: "success",
					modelCount: currentModelIds.length,
					diff: null,
				});
				continue;
			}

			const previousSorted = Array.from(previousModelIds.values()).sort((left, right) => left.localeCompare(right));
			const previousSet = new Set(previousSorted);
			const currentSet = new Set(currentModelIds);
			const addedModelIds = currentModelIds.filter((modelId) => !previousSet.has(modelId));
			const removedModelIds = previousSorted.filter((modelId) => !currentSet.has(modelId));
			const diff =
				addedModelIds.length > 0 || removedModelIds.length > 0
					? {
							orgId,
							addedModelIds,
							removedModelIds,
					  }
					: null;

			if (diff) {
				diffs.push(diff);
			}

			results.push({
				orgId,
				status: "success",
				modelCount: currentModelIds.length,
				diff,
			});
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`[model-discovery][hf] ${orgId}: ${message}`);
			results.push({
				orgId,
				status: "error",
				reason: message,
			});
		}
	}

	const upsertRows = Array.from(currentByOrg.entries()).flatMap(([orgId, modelIds]) =>
		modelIds.map((modelId) => ({
			org_id: orgId,
			model_id: modelId,
			last_seen_at: detectedAt,
		}))
	);
	await upsertCurrentHuggingFaceState(upsertRows);

	const deleteRows = Array.from(currentByOrg.entries()).flatMap(([orgId, currentModelIds]) => {
		const previousModelIds = previousByOrg.get(orgId) ?? new Set<string>();
		const currentSet = new Set(currentModelIds);
		const removed = Array.from(previousModelIds.values()).filter((modelId) => !currentSet.has(modelId));
		return removed.length > 0 ? [{ orgId, modelIds: removed }] : [];
	});
	await deleteRemovedHuggingFaceState(deleteRows);

	const additionsDetected = diffs.reduce((sum, diff) => sum + diff.addedModelIds.length, 0);
	const removalsDetected = diffs.reduce((sum, diff) => sum + diff.removedModelIds.length, 0);
	const summary: HuggingFaceDiscoverySummary = {
		enabled: true,
		executed: true,
		baselineInitialized,
		orgsConfigured: orgIds.length,
		orgsSucceeded: results.filter((result) => result.status === "success").length,
		orgsError: results.filter((result) => result.status === "error").length,
		additionsDetected,
		removalsDetected,
		notified: false,
		results,
	};

	if (diffs.length === 0) {
		return summary;
	}

	const webhookUrl = trimOrNull(readBindingEnv(["DISCORD_WEBHOOK_URL"]));
	if (!webhookUrl) {
		console.log(
			`[model-discovery][hf] ${additionsDetected + removalsDetected} Hugging Face model event(s) detected, but DISCORD_WEBHOOK_URL is missing.`
		);
		summary.skippedReason = "missing DISCORD_WEBHOOK_URL";
	} else {
		try {
			await sendDiscordTextMessage({
				webhookUrl,
				message: buildDiscordMessage(diffs),
			});
			summary.notified = true;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			console.error(`[model-discovery][hf] Discord notification failed: ${message}`);
			summary.notificationError = message;
		}
	}

	try {
		summary.issueSync = await syncUpstreamDiscoveryIssues(
			buildIssueEntries(diffs, detectedAt, "cloudflare_cron:huggingface")
		);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[model-discovery][hf] GitHub issue sync failed: ${message}`);
		summary.issueSync = {
			created: 0,
			updated: 0,
			skipped: false,
			error: message,
		};
	}

	return summary;
}
