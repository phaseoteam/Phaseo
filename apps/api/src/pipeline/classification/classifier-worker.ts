import { getBindings, getSupabaseAdmin } from "@/runtime/env";

type ContributionRow = {
	id: string;
	workspace_id: string;
	request_id: string;
	occurred_at: string;
	model_slug: string;
	provider_slug: string | null;
	object_key: string;
	input_tokens: number | null;
	output_tokens: number | null;
	attempt_count: number;
};

type ClassifierRow = {
	id: string;
	workspace_id: string;
	slug: string;
	name: string;
	instructions: string;
	categories: Record<string, unknown>;
	model: string;
	service_tier: "standard" | "flex";
	sample_rate_bps: number;
};

type Classification = {
	primary_category: string;
	labels: string[];
	confidence: number | null;
};

export const STARTER_TASK_CATEGORIES = {
	code: ["code_generation", "code_explanation", "code_review", "debugging", "tool_use"],
	data: ["analysis", "extraction", "classification", "structured_output", "math"],
	agent: ["planning", "research", "web_search", "multi_step", "automation"],
	general: ["chat", "creative_writing", "translation", "summarization", "question_answering", "other"],
} as const;

export const STARTER_CLASSIFIER_SLUG = "phaseo-task-v1";
export const ALLOWED_CLASSIFIER_MODELS = new Set(["gpt-5-mini"]);
/**
 * Each enabled classifier is one model call on Phaseo's OpenAI key per sampled contribution
 * (up to 200k characters), so a workspace runs at most this many, the starter one included.
 */
export const MAX_ENABLED_CLASSIFIERS_PER_WORKSPACE = 3;

export const STARTER_TASK_INSTRUCTIONS = [
	"Classify the user request by its primary task, not its subject matter.",
	"Choose exactly one primary category from the supplied taxonomy and zero or more labels.",
	"Use other only when no more specific label applies.",
	"Do not repeat or quote any request content in the output.",
].join(" ");

export function starterClassifierRow(workspaceId: string, createdBy?: string | null) {
	return {
		workspace_id: workspaceId,
		slug: STARTER_CLASSIFIER_SLUG,
		name: "Task categories",
		description: "Task taxonomy starter preset.",
		kind: "phaseo_task",
		instructions: STARTER_TASK_INSTRUCTIONS,
		categories: STARTER_TASK_CATEGORIES,
		model: "gpt-5-mini",
		service_tier: "flex",
		sample_rate_bps: 10000,
		enabled: true,
		created_by: createdBy ?? null,
		updated_at: new Date().toISOString(),
	};
}

/** The database refused to enable another classifier (enforce_workspace_classifier_limit). */
export function isClassifierLimitError(error: { message?: string } | null | undefined): boolean {
	return Boolean(error?.message?.includes("classifier_limit_reached"));
}

export async function ensureStarterClassifier(workspaceId: string, createdBy?: string | null): Promise<void> {
	const upsertStarter = (enabled: boolean) => getSupabaseAdmin().from("workspace_classifiers").upsert(
		{ ...starterClassifierRow(workspaceId, createdBy), enabled },
		{ onConflict: "workspace_id,slug", ignoreDuplicates: true },
	);
	let { error } = await upsertStarter(true);
	// At the cap the starter is added switched off, so consenting still works.
	if (isClassifierLimitError(error)) ({ error } = await upsertStarter(false));
	if (error) throw new Error(error.message || "Failed to create starter classifier");
}

function flattenCategories(categories: Record<string, unknown>): string[] {
	return Array.from(new Set(Object.entries(categories).flatMap(([group, values]) => [
		group,
		...(Array.isArray(values) ? values.map(String) : []),
	]))).filter(Boolean);
}

async function classifierSampleBucket(contributionId: string, classifierId: string): Promise<number> {
	const bytes = new TextEncoder().encode(`${contributionId}:${classifierId}`);
	const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
	return (((digest[0] << 8) | digest[1]) >>> 0) % 10_000;
}

function extractResponseText(payload: any): string {
	if (typeof payload?.output_text === "string") return payload.output_text;
	for (const item of Array.isArray(payload?.output) ? payload.output : []) {
		for (const content of Array.isArray(item?.content) ? item.content : []) {
			if (typeof content?.text === "string") return content.text;
		}
	}
	throw new Error("classifier_response_missing_output");
}

async function classify(payload: unknown, classifier: ClassifierRow): Promise<{ value: Classification; latencyMs: number }> {
	const bindings = getBindings();
	const apiKey = bindings.OPENAI_API_KEY?.trim();
	if (!apiKey) throw new Error("classifier_openai_key_missing");
	const allowed = flattenCategories(classifier.categories);
	if (!allowed.length) throw new Error("classifier_categories_empty");
	const startedAt = Date.now();
	const response = await fetch(`${(bindings.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "")}/responses`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: classifier.model || bindings.DATA_CONTRIBUTION_CLASSIFIER_MODEL || "gpt-5-mini",
			service_tier: classifier.service_tier || bindings.DATA_CONTRIBUTION_CLASSIFIER_SERVICE_TIER || "flex",
			store: false,
			instructions: classifier.instructions,
			input: JSON.stringify(payload).slice(0, 200_000),
			max_output_tokens: 300,
			text: {
				format: {
					type: "json_schema",
					name: "request_classification",
					strict: true,
					schema: {
						type: "object",
						additionalProperties: false,
						required: ["primary_category", "labels", "confidence"],
						properties: {
							primary_category: { type: "string", enum: allowed },
							labels: { type: "array", items: { type: "string", enum: allowed }, maxItems: 8 },
							confidence: { type: ["number", "null"], minimum: 0, maximum: 1 },
						},
					},
				},
			},
		}),
	});
	if (!response.ok) {
		const detail = (await response.text()).slice(0, 500);
		throw new Error(`classifier_http_${response.status}:${detail}`);
	}
	const parsed = JSON.parse(extractResponseText(await response.json())) as Classification;
	if (!allowed.includes(parsed.primary_category)) throw new Error("classifier_category_invalid");
	return {
		value: {
			primary_category: parsed.primary_category,
			labels: Array.from(new Set((parsed.labels ?? []).filter((label) => allowed.includes(label)))).slice(0, 8),
			confidence: typeof parsed.confidence === "number" ? parsed.confidence : null,
		},
		latencyMs: Date.now() - startedAt,
	};
}

async function completeContribution(contribution: ContributionRow, classifiers: ClassifierRow[], payload: unknown): Promise<void> {
	const client = getSupabaseAdmin();
	const existingResult = await client.from("request_classifications")
		.select("classifier_id")
		.eq("contribution_id", contribution.id);
	if (existingResult.error) throw new Error(existingResult.error.message || "classification state read failed");
	const completedClassifierIds = new Set((existingResult.data ?? []).map((row) => String(row.classifier_id)));
	for (const classifier of classifiers) {
		if (await classifierSampleBucket(contribution.id, classifier.id) >= classifier.sample_rate_bps) continue;
		if (!completedClassifierIds.has(classifier.id)) {
			const result = await classify(payload, classifier);
			const { error: resultError } = await client.from("request_classifications").upsert({
				contribution_id: contribution.id,
				workspace_id: contribution.workspace_id,
				classifier_id: classifier.id,
				primary_category: result.value.primary_category,
				labels: result.value.labels,
				confidence: result.value.confidence,
				model: classifier.model,
				service_tier: classifier.service_tier,
				latency_ms: result.latencyMs,
			}, { onConflict: "contribution_id,classifier_id" });
			if (resultError) throw new Error(resultError.message || "classification upsert failed");
		}

		const { error: rollupError } = await client.rpc("refresh_request_classification_rollup", {
			p_contribution_id: contribution.id,
			p_classifier_id: classifier.id,
		});
		if (rollupError) throw new Error(rollupError.message || "classification rollup refresh failed");
	}
	const now = new Date().toISOString();
	const { error } = await client.from("data_contributions").update({
		status: "complete",
		completed_at: now,
		lease_expires_at: null,
		last_error: null,
		updated_at: now,
	}).eq("id", contribution.id).eq("status", "processing");
	if (error) throw new Error(error.message || "contribution completion failed");
}

async function failContribution(contribution: ContributionRow, error: unknown): Promise<void> {
	const terminal = contribution.attempt_count >= 8;
	const backoffSeconds = Math.min(3600, 30 * (2 ** Math.min(contribution.attempt_count, 7)));
	await getSupabaseAdmin().from("data_contributions").update({
		status: "failed",
		available_at: new Date(Date.now() + (terminal ? 86_400 : backoffSeconds) * 1000).toISOString(),
		lease_expires_at: null,
		last_error: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
		updated_at: new Date().toISOString(),
	}).eq("id", contribution.id).eq("status", "processing");
}

export async function runDataContributionClassifierJob(args?: { limit?: number; concurrency?: number }) {
	const bindings = getBindings();
	const limit = Math.max(1, Math.min(250, Math.trunc(args?.limit ?? 25)));
	const concurrency = Math.max(1, Math.min(16, Math.trunc(args?.concurrency ?? 4)));
	const client = getSupabaseAdmin();
	const claimed = await client.rpc("claim_data_contributions", { p_limit: limit, p_lease_seconds: 600 });
	if (claimed.error) throw new Error(claimed.error.message || "Failed to claim contributions");
	const rows = (claimed.data ?? []) as ContributionRow[];
	let completed = 0;
	let failed = 0;
	let cursor = 0;
	const workers = Array.from({ length: Math.min(concurrency, rows.length) }, async () => {
		while (cursor < rows.length) {
			const contribution = rows[cursor++];
			try {
				const [object, classifiersResult] = await Promise.all([
					bindings.DATA_CONTRIBUTIONS_BUCKET?.get(contribution.object_key),
					client.from("workspace_classifiers").select("id,workspace_id,slug,name,instructions,categories,model,service_tier,sample_rate_bps")
						.eq("workspace_id", contribution.workspace_id).eq("enabled", true)
						.order("created_at", { ascending: true }).limit(MAX_ENABLED_CLASSIFIERS_PER_WORKSPACE),
				]);
				if (!object) throw new Error("contribution_object_missing");
				if (classifiersResult.error) throw new Error(classifiersResult.error.message || "classifier list failed");
				const storedPayload = JSON.parse(await object.text()) as Record<string, unknown>;
				await completeContribution(
					contribution,
					(classifiersResult.data ?? []) as ClassifierRow[],
					{ request: storedPayload.request ?? null, response: storedPayload.response ?? null },
				);
				completed += 1;
			} catch (error) {
				failed += 1;
				await failContribution(contribution, error);
			}
		}
	});
	await Promise.all(workers);
	const publicRollup = await client.rpc("refresh_public_model_task_daily", {
		p_since: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
	});
	if (publicRollup.error) throw new Error(publicRollup.error.message || "public classification rollup refresh failed");
	return { claimed: rows.length, completed, failed };
}
