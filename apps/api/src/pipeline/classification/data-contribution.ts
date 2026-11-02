import { getBindings, getSupabaseAdmin } from "@/runtime/env";
import { redactSensitiveInfoForStorage } from "@/pipeline/before/sensitiveInfo";

export const DATA_CONTRIBUTION_POLICY_VERSION = "2026-07-26-v2";
export const DATA_CONTRIBUTION_REDACTION_VERSION = "2026-10-29-v2";
export const DATA_CONTRIBUTION_DEFAULT_SAMPLE_RATE_BPS = 10000;
export const DATA_CONTRIBUTION_DEFAULT_CLASSIFIER_SAMPLE_RATE_BPS = 1000;
const DEFAULT_RETENTION_DAYS = 30;
const DEFAULT_MAX_BYTES = 1024 * 1024;

export type DataContributionPolicy = {
	enabled: boolean;
	policyVersion: string | null;
	sampleRateBps: number;
	classifierSampleRateBps: number;
	discountBps: number;
};

type PersistContributionInput = {
	requestId: string;
	workspaceId: string;
	endpoint: string;
	model: string;
	provider?: string | null;
	requestPayload: unknown;
	gatewayResponse: unknown;
	usage?: any;
	discountNanos: number;
	policy: DataContributionPolicy;
};

function boundedBps(value: unknown, fallback: number): number {
	const numeric = Number(value);
	return Number.isFinite(numeric)
		? Math.max(0, Math.min(10_000, Math.trunc(numeric)))
		: fallback;
}

export function normalizeDataContributionPolicy(value: {
	dataContributionEnabled?: boolean | null;
	dataContributionPolicyVersion?: string | null;
	dataContributionSampleRateBps?: number | null;
	dataContributionClassifierSampleRateBps?: number | null;
	dataContributionDiscountBps?: number | null;
} | null | undefined): DataContributionPolicy {
	return {
		enabled: value?.dataContributionEnabled === true,
		policyVersion: typeof value?.dataContributionPolicyVersion === "string"
			? value.dataContributionPolicyVersion
			: null,
		sampleRateBps: boundedBps(
			value?.dataContributionSampleRateBps,
			DATA_CONTRIBUTION_DEFAULT_SAMPLE_RATE_BPS,
		),
		classifierSampleRateBps: boundedBps(
			value?.dataContributionClassifierSampleRateBps,
			DATA_CONTRIBUTION_DEFAULT_CLASSIFIER_SAMPLE_RATE_BPS,
		),
		discountBps: boundedBps(value?.dataContributionDiscountBps, 100),
	};
}

export async function deterministicContributionBucket(
	workspaceId: string,
	requestId: string,
	policyVersion: string,
): Promise<number> {
	const bytes = new TextEncoder().encode(`${workspaceId}:${requestId}:${policyVersion}`);
	const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
	return (((digest[0] << 8) | digest[1]) >>> 0) % 10_000;
}

export function dataContributionQueueStatus(
	sampleBucket: number,
	classifierSampleRateBps: number,
): "pending" | "retained" {
	return sampleBucket < boundedBps(classifierSampleRateBps, 0) ? "pending" : "retained";
}

type SanitizationContext = { redactionCount: number };

function replaceAndCount(
	value: string,
	pattern: RegExp,
	replacement: string,
	context: SanitizationContext,
): string {
	return value.replace(pattern, () => {
		context.redactionCount += 1;
		return replacement;
	});
}

// Contributions never keep image, audio or file bytes, however small or wherever
// they sit, so no user-supplied media is retained for training or review.
const MIN_BARE_BASE64_LENGTH = 256;
const BARE_BASE64 = /^[A-Za-z0-9+/_-]+={0,2}$/;
const MEDIA_BYTE_KEYS = new Set(["b64_json", "partial_image_b64"]);

function isMediaBytesField(key: string, parent: Record<string, unknown>): boolean {
	if (MEDIA_BYTE_KEYS.has(key)) return true;
	if (key !== "data") return false;
	return parent.type === "base64" ||
		"mime_type" in parent || "mimeType" in parent || "media_type" in parent || "format" in parent;
}

function redactString(value: string, context: SanitizationContext): string {
	if (value.startsWith("data:")) {
		context.redactionCount += 1;
		return "[REDACTED_DATA_URL]";
	}
	if (value.length >= MIN_BARE_BASE64_LENGTH && BARE_BASE64.test(value)) {
		context.redactionCount += 1;
		return "[REDACTED_BASE64]";
	}
	let redacted = replaceAndCount(
		value,
		/data:[\w.+-]+\/[\w.+-]+(?:;[\w.+-]+=[\w.+-]+)*;base64,[A-Za-z0-9+/=]+/g,
		"[REDACTED_DATA_URL]",
		context,
	);
	redacted = replaceAndCount(
		redacted,
		/\b(?:phaseo_v\d+_(?:sk|mk)_|sk-|pk-|rk-|sess-)[A-Za-z0-9_-]{12,}\b/g,
		"[REDACTED_SECRET]",
		context,
	);
	redacted = replaceAndCount(
		redacted,
		/\b(?:AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|gh[pousr]_[A-Za-z0-9]{20,})\b/g,
		"[REDACTED_SECRET]",
		context,
	);
	redacted = replaceAndCount(
		redacted,
		/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
		"[REDACTED_PRIVATE_KEY]",
		context,
	);
	redacted = replaceAndCount(
		redacted,
		/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
		"[REDACTED_JWT]",
		context,
	);
	redacted = replaceAndCount(
		redacted,
		/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi,
		"Bearer [REDACTED]",
		context,
	);
	redacted = redacted.replace(/https?:\/\/[^\s"'<>]+/gi, (candidate) => {
		try {
			const url = new URL(candidate);
			if (!url.search && !url.hash && !url.username && !url.password) return candidate;
			url.search = "";
			url.hash = "";
			url.username = "";
			url.password = "";
			context.redactionCount += 1;
			return url.toString();
		} catch {
			return candidate;
		}
	});
	const sensitive = redactSensitiveInfoForStorage(redacted);
	context.redactionCount += sensitive.redactionCount;
	return sensitive.text;
}

function sanitize(value: unknown, context: SanitizationContext, depth = 0): unknown {
	if (depth > 20) return "[TRUNCATED_DEPTH]";
	if (typeof value === "string") return redactString(value, context);
	if (Array.isArray(value)) return value.map((entry) => sanitize(entry, context, depth + 1));
	if (!value || typeof value !== "object") return value ?? null;
	const record = value as Record<string, unknown>;
	return Object.fromEntries(
		Object.entries(record).map(([key, entry]) => [
			key,
			/(?:api[_-]?key|authorization|cookie|password|private[_-]?key|secret|token|user[_-]?id|session[_-]?id)$/i.test(key) || key.toLowerCase() === "user"
				? (() => {
					context.redactionCount += 1;
					return "[REDACTED]";
				})()
				: typeof entry === "string" && entry && isMediaBytesField(key, record)
					? (() => {
						context.redactionCount += 1;
						return "[REDACTED_BASE64]";
					})()
					: sanitize(entry, context, depth + 1),
		]),
	);
}

export function sanitizeDataContributionPayload(value: unknown): {
	value: unknown;
	redactionCount: number;
} {
	const context = { redactionCount: 0 };
	return { value: sanitize(value, context), redactionCount: context.redactionCount };
}

export async function pruneExpiredDataContributions(limit = 250): Promise<{ deleted: number; failed: number }> {
	const bindings = getBindings();
	const bucket = bindings.DATA_CONTRIBUTIONS_BUCKET;
	if (!bucket) return { deleted: 0, failed: 0 };
	const client = getSupabaseAdmin();
	const { data, error } = await client.from("data_contributions")
		.select("id,object_key")
		.lt("retention_until", new Date().toISOString())
		.neq("status", "deleted")
		.order("retention_until", { ascending: true })
		.limit(Math.max(1, Math.min(5000, Math.trunc(limit))));
	if (error) throw new Error(error.message || "Failed to list expired contributions");
	let deleted = 0;
	let failed = 0;
	const rows = data ?? [];
	for (let index = 0; index < rows.length; index += 1000) {
		const batch = rows.slice(index, index + 1000);
		try {
			await bucket.delete(batch.map((row) => String(row.object_key)));
			const update = await client.from("data_contributions").update({
				status: "deleted",
				lease_expires_at: null,
				updated_at: new Date().toISOString(),
			}).in("id", batch.map((row) => row.id));
			if (update.error) throw update.error;
			deleted += batch.length;
		} catch {
			failed += batch.length;
		}
	}
	return { deleted, failed };
}

function isoDatePath(date: Date): string {
	return [date.getUTCFullYear(), String(date.getUTCMonth() + 1).padStart(2, "0"), String(date.getUTCDate()).padStart(2, "0")].join("/");
}

function tokenCount(usage: any, kind: "input" | "output"): number | null {
	const candidates = kind === "input"
		? [usage?.input_tokens, usage?.prompt_tokens, usage?.input_text_tokens]
		: [usage?.output_tokens, usage?.completion_tokens, usage?.output_text_tokens];
	for (const candidate of candidates) {
		const numeric = Number(candidate);
		if (Number.isFinite(numeric) && numeric >= 0) return Math.trunc(numeric);
	}
	return null;
}

export async function persistDataContribution(
	input: PersistContributionInput,
): Promise<{ status: "not_enabled" | "not_sampled" | "stored" | "missing_bucket" | "too_large" | "error"; sampleBucket?: number }> {
	const policyVersion = input.policy.policyVersion ?? DATA_CONTRIBUTION_POLICY_VERSION;
	if (!input.policy.enabled) return { status: "not_enabled" };
	const sampleBucket = await deterministicContributionBucket(
		input.workspaceId,
		input.requestId,
		policyVersion,
	);
	if (sampleBucket >= input.policy.sampleRateBps) return { status: "not_sampled", sampleBucket };

	const bindings = getBindings();
	const bucket = bindings.DATA_CONTRIBUTIONS_BUCKET;
	if (!bucket) {
		console.error("data_contribution_bucket_missing", {
			workspaceId: input.workspaceId,
			requestId: input.requestId,
		});
		return { status: "missing_bucket", sampleBucket };
	}
	try {
		const now = new Date();
		const retentionUntil = new Date(now.getTime() + DEFAULT_RETENTION_DAYS * 86_400_000);
		const sanitizedRequest = sanitizeDataContributionPayload(input.requestPayload);
		const sanitizedResponse = sanitizeDataContributionPayload(input.gatewayResponse);
		const redactionCount = sanitizedRequest.redactionCount + sanitizedResponse.redactionCount;
		const payload = {
			schema_version: 1,
			redaction_version: DATA_CONTRIBUTION_REDACTION_VERSION,
			redaction_count: redactionCount,
			request_id: input.requestId,
			workspace_id: input.workspaceId,
			endpoint: input.endpoint,
			model: input.model,
			provider: input.provider ?? null,
			request: sanitizedRequest.value,
			response: sanitizedResponse.value,
		};
		const bytes = new TextEncoder().encode(JSON.stringify(payload));
		const configuredMax = Number(bindings.DATA_CONTRIBUTIONS_MAX_BYTES ?? DEFAULT_MAX_BYTES);
		const maxBytes = Number.isFinite(configuredMax)
			? Math.max(64 * 1024, Math.min(5 * 1024 * 1024, Math.trunc(configuredMax)))
			: DEFAULT_MAX_BYTES;
		if (bytes.byteLength > maxBytes) {
			console.warn("data_contribution_payload_too_large", {
				workspaceId: input.workspaceId,
				requestId: input.requestId,
				payloadBytes: bytes.byteLength,
				maxBytes,
			});
			return { status: "too_large", sampleBucket };
		}

		const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
		const sha256 = Array.from(digest).map((byte) => byte.toString(16).padStart(2, "0")).join("");
		const objectKey = `contributions/${input.workspaceId}/${isoDatePath(now)}/${input.requestId}.json`;
		await bucket.put(objectKey, bytes, {
			httpMetadata: { contentType: "application/json" },
			customMetadata: {
				workspace_id: input.workspaceId,
				request_id: input.requestId,
				retention_until: retentionUntil.toISOString(),
			},
		});
		const { error } = await getSupabaseAdmin().from("data_contributions").upsert({
			workspace_id: input.workspaceId,
			request_id: input.requestId,
			endpoint: input.endpoint,
			model_slug: input.model,
			provider_slug: input.provider ?? null,
			object_key: objectKey,
			object_bytes: bytes.byteLength,
			object_sha256: sha256,
			retention_until: retentionUntil.toISOString(),
			consent_policy_version: policyVersion,
			sample_rate_bps: input.policy.sampleRateBps,
			classifier_sample_rate_bps: input.policy.classifierSampleRateBps,
			sample_bucket: sampleBucket,
			redaction_version: DATA_CONTRIBUTION_REDACTION_VERSION,
			redaction_count: redactionCount,
			discount_bps: input.policy.discountBps,
			discount_nanos: Math.max(0, Math.trunc(input.discountNanos)),
			input_tokens: tokenCount(input.usage, "input"),
			output_tokens: tokenCount(input.usage, "output"),
			status: dataContributionQueueStatus(sampleBucket, input.policy.classifierSampleRateBps),
			available_at: now.toISOString(),
			updated_at: now.toISOString(),
		}, { onConflict: "workspace_id,request_id", ignoreDuplicates: true });
		if (error) {
			await bucket.delete(objectKey);
			throw new Error(error.message || "contribution metadata insert failed");
		}
		return { status: "stored", sampleBucket };
	} catch (error) {
		console.error("data_contribution_capture_failed", {
			workspaceId: input.workspaceId,
			requestId: input.requestId,
			error: error instanceof Error ? error.message : String(error),
		});
		return { status: "error", sampleBucket };
	}
}
