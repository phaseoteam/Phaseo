import { promises as fs } from "fs";
import { createHash } from "crypto";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { DIR_MODELS, DIR_ORGS, DIR_PROVIDERS } from "./paths";
import { listDirs, readJson } from "./util";

type ExistingModel = {
	modelId: string;
	organisationId: string;
	filePath: string;
	name: string;
};

type ProviderModelRow = Record<string, unknown> & {
	api_model_id?: string | null;
	internal_model_id?: string | null;
	provider_model_slug?: string | null;
	input_modalities?: string | string[] | null;
	output_modalities?: string | string[] | null;
	effective_from?: string | null;
};

type CandidateStrategy =
	| "exact_api_model_id"
	| "normalized_tail_unique"
	| "provider_slug_unique"
	| "fuzzy_token_unique";

type CandidateMatch = {
	modelId: string;
	strategy: CandidateStrategy;
	score: number;
};

type ApiAggregate = {
	apiModelId: string;
	organisationId: string;
	providerIds: Set<string>;
	inputModalities: Set<string>;
	outputModalities: Set<string>;
	earliestEffectiveFrom: string | null;
	providerSlugSamples: Set<string>;
};

type ProviderFile = {
	providerId: string;
	filePath: string;
	rows: ProviderModelRow[];
	changed: boolean;
};

type UnresolvedRow = {
	providerId: string;
	filePath: string;
	providerApiModelId: string;
	apiModelId: string;
	providerModelSlug: string | null;
	currentInternalModelId: string | null;
	suggestedModelId: string | null;
	suggestedStrategy: CandidateStrategy | null;
	suggestedScore: number | null;
};

type ScriptArgs = {
	write: boolean;
	createStubs: boolean;
	applyFuzzy: boolean;
	providerFilter: string | null;
	reportPath: string;
	exportCsv: boolean;
};

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPORT_PATH = resolve(
	SCRIPT_DIR,
	"reports",
	"api-model-link-reconcile-report.json",
);
const AUTO_APPLY_STRATEGIES = new Set<CandidateStrategy>([
	"exact_api_model_id",
	"normalized_tail_unique",
	"provider_slug_unique",
]);
const MODALITY_ORDER = ["text", "image", "audio", "video", "embedding", "moderation", "file"];

function parseArgs(argv: string[]): ScriptArgs {
	const getArg = (name: string): string | null => {
		const prefixed = `--${name}=`;
		const entry = argv.find((arg) => arg.startsWith(prefixed));
		return entry ? entry.slice(prefixed.length) : null;
	};

	return {
		write: argv.includes("--write"),
		createStubs: argv.includes("--create-stubs"),
		applyFuzzy: argv.includes("--apply-fuzzy"),
		providerFilter: getArg("provider"),
		reportPath: getArg("report")
			? resolve(process.cwd(), getArg("report") as string)
			: DEFAULT_REPORT_PATH,
		exportCsv: !argv.includes("--no-csv"),
	};
}

function normalizeKey(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

function splitModelId(modelId: string): { organisationId: string; tail: string } {
	const [organisationId = "", ...rest] = modelId.split("/");
	return {
		organisationId: organisationId.trim(),
		tail: rest.join("/").trim(),
	};
}

function stripDateSuffix(value: string): string {
	return value
		.replace(/-\d{4}(?:-\d{2}){2}$/g, "")
		.replace(/-\d{4}-\d{2}$/g, "")
		.replace(/-\d{4}$/g, "");
}

function normalizeTail(modelId: string): string {
	const { tail } = splitModelId(modelId);
	return stripDateSuffix(normalizeKey(tail || modelId));
}

function normalizeSlug(slug: string | null | undefined): string {
	return normalizeKey(String(slug ?? ""));
}

function tokenize(value: string): Set<string> {
	return new Set(
		value
			.split("-")
			.map((part) => part.trim())
			.filter(Boolean),
	);
}

function jaccard(a: Set<string>, b: Set<string>): number {
	if (a.size === 0 || b.size === 0) return 0;
	let intersection = 0;
	for (const token of a) {
		if (b.has(token)) intersection += 1;
	}
	const union = a.size + b.size - intersection;
	return union > 0 ? intersection / union : 0;
}

function parseModalities(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value
			.map((entry) => String(entry ?? "").trim().toLowerCase())
			.filter(Boolean);
	}
	if (typeof value === "string") {
		return value
			.split(",")
			.map((entry) => entry.trim().toLowerCase())
			.filter(Boolean);
	}
	return [];
}

function normalizeDate(value: string | null | undefined): string | null {
	if (!value) return null;
	const timestamp = new Date(value).getTime();
	if (!Number.isFinite(timestamp)) return null;
	return new Date(timestamp).toISOString().slice(0, 19);
}

function sortModalities(values: Set<string>): string[] {
	const order = new Map(MODALITY_ORDER.map((item, index) => [item, index]));
	return Array.from(values).sort((a, b) => {
		const ai = order.get(a);
		const bi = order.get(b);
		if (ai !== undefined || bi !== undefined) {
			if (ai === undefined) return 1;
			if (bi === undefined) return -1;
			return ai - bi;
		}
		return a.localeCompare(b);
	});
}

function toTitleName(input: string): string {
	const acronyms = new Set([
		"ai",
		"api",
		"gpt",
		"llm",
		"vlm",
		"tts",
		"glm",
		"qwen",
		"sora",
	]);
	return input
		.replace(/[._/:+-]+/g, " ")
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => {
			const lower = part.toLowerCase();
			if (acronyms.has(lower)) return lower.toUpperCase();
			if (/^[a-z]{1,3}\d+$/i.test(part)) return part.toUpperCase();
			if (/^\d+[a-z]*$/i.test(part)) return part.toUpperCase();
			return `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
		})
		.join(" ");
}

function toDirSlug(apiModelId: string): string {
	const { tail } = splitModelId(apiModelId);
	const source = tail || apiModelId;
	const slug = source
		.toLowerCase()
		.replace(/[<>:"/\\|?*\s]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	if (slug) return slug;
	return createHash("md5").update(apiModelId).digest("hex").slice(0, 10);
}

function inferCandidate(
	row: ProviderModelRow,
	existingModelIds: Set<string>,
	modelsByOrg: Map<string, ExistingModel[]>,
): CandidateMatch | null {
	const apiModelId = String(row.api_model_id ?? "").trim();
	if (!apiModelId) return null;

	if (existingModelIds.has(apiModelId)) {
		return {
			modelId: apiModelId,
			strategy: "exact_api_model_id",
			score: 1,
		};
	}

	const { organisationId } = splitModelId(apiModelId);
	if (!organisationId) return null;
	const orgModels = modelsByOrg.get(organisationId) ?? [];
	if (orgModels.length === 0) return null;

	const apiNorm = normalizeTail(apiModelId);
	const apiTokens = tokenize(apiNorm);
	const slugNorm = normalizeSlug(row.provider_model_slug);

	const normMatches = orgModels.filter(
		(model) => normalizeTail(model.modelId) === apiNorm,
	);
	if (normMatches.length === 1) {
		return {
			modelId: normMatches[0].modelId,
			strategy: "normalized_tail_unique",
			score: 0.97,
		};
	}

	if (slugNorm) {
		const slugMatches = orgModels.filter(
			(model) => normalizeTail(model.modelId) === slugNorm,
		);
		if (slugMatches.length === 1) {
			return {
				modelId: slugMatches[0].modelId,
				strategy: "provider_slug_unique",
				score: 0.93,
			};
		}
	}

	const scored = orgModels
		.map((model) => {
			const modelNorm = normalizeTail(model.modelId);
			const modelTokens = tokenize(modelNorm);
			let score = jaccard(apiTokens, modelTokens);

			if (apiNorm && modelNorm) {
				if (apiNorm === modelNorm) score = 1;
				else if (modelNorm.includes(apiNorm) || apiNorm.includes(modelNorm)) {
					score = Math.max(score, 0.89);
				}
			}

			if (slugNorm) {
				const slugTokens = tokenize(slugNorm);
				score = Math.max(score, jaccard(slugTokens, modelTokens) * 0.95);
			}

			return {
				modelId: model.modelId,
				score,
			};
		})
		.sort((a, b) => b.score - a.score);

	if (!scored.length) return null;
	const best = scored[0];
	const second = scored[1];
	if (best.score < 0.84) return null;
	if (second && best.score - second.score < 0.12) return null;

	return {
		modelId: best.modelId,
		strategy: "fuzzy_token_unique",
		score: Number(best.score.toFixed(4)),
	};
}

async function loadExistingModels(): Promise<{
	models: ExistingModel[];
	modelIdSet: Set<string>;
	modelsByOrg: Map<string, ExistingModel[]>;
}> {
	const models: ExistingModel[] = [];
	const modelIdSet = new Set<string>();
	const modelsByOrg = new Map<string, ExistingModel[]>();

	for (const orgDir of await listDirs(DIR_MODELS)) {
		for (const modelDir of await listDirs(orgDir)) {
			const filePath = join(modelDir, "model.json");
			try {
				const model = await readJson<Record<string, unknown>>(filePath);
				const modelId = String(model.model_id ?? "").trim();
				const organisationId = String(model.organisation_id ?? "").trim();
				if (!modelId || !organisationId) continue;
				const item: ExistingModel = {
					modelId,
					organisationId,
					filePath,
					name: String(model.name ?? "").trim(),
				};
				models.push(item);
				modelIdSet.add(modelId);
				const bucket = modelsByOrg.get(organisationId) ?? [];
				bucket.push(item);
				modelsByOrg.set(organisationId, bucket);
			} catch {
				// Ignore malformed JSON files here; validator catches those separately.
			}
		}
	}

	return { models, modelIdSet, modelsByOrg };
}

async function loadOrganisationIds(): Promise<Set<string>> {
	const organisationIds = new Set<string>();
	for (const orgDir of await listDirs(DIR_ORGS)) {
		const filePath = join(orgDir, "organisation.json");
		try {
			const org = await readJson<Record<string, unknown>>(filePath);
			const id = String(org.organisation_id ?? "").trim();
			if (id) {
				organisationIds.add(id);
				continue;
			}
		} catch {
			// Fall back to directory name.
		}
		organisationIds.add(orgDir.split(/[\\/]/).at(-1) ?? "");
	}
	return organisationIds;
}

async function loadProviderFiles(providerFilter: string | null): Promise<ProviderFile[]> {
	const files: ProviderFile[] = [];
	for (const providerDir of await listDirs(DIR_PROVIDERS)) {
		const providerId = providerDir.split(/[\\/]/).at(-1) ?? "";
		if (!providerId) continue;
		if (providerFilter && providerId !== providerFilter) continue;

		const filePath = join(providerDir, "models.json");
		try {
			const parsed = await readJson<unknown>(filePath);
			if (!Array.isArray(parsed)) continue;
			const rows = parsed.filter((item) => item && typeof item === "object") as ProviderModelRow[];
			files.push({
				providerId,
				filePath,
				rows,
				changed: false,
			});
		} catch {
			// providers without models.json are valid.
		}
	}
	return files;
}

function ensureApiAggregate(
	aggregates: Map<string, ApiAggregate>,
	apiModelId: string,
	providerId: string,
): ApiAggregate {
	const existing = aggregates.get(apiModelId);
	if (existing) return existing;
	const { organisationId } = splitModelId(apiModelId);
	const created: ApiAggregate = {
		apiModelId,
		organisationId,
		providerIds: new Set([providerId]),
		inputModalities: new Set<string>(),
		outputModalities: new Set<string>(),
		earliestEffectiveFrom: null,
		providerSlugSamples: new Set<string>(),
	};
	aggregates.set(apiModelId, created);
	return created;
}

function updateAggregate(
	aggregate: ApiAggregate,
	row: ProviderModelRow,
	providerId: string,
): void {
	aggregate.providerIds.add(providerId);
	for (const modality of parseModalities(row.input_modalities)) {
		aggregate.inputModalities.add(modality);
	}
	for (const modality of parseModalities(row.output_modalities)) {
		aggregate.outputModalities.add(modality);
	}
	const normalizedDate = normalizeDate(String(row.effective_from ?? ""));
	if (normalizedDate) {
		if (!aggregate.earliestEffectiveFrom) {
			aggregate.earliestEffectiveFrom = normalizedDate;
		} else {
			aggregate.earliestEffectiveFrom =
				normalizedDate < aggregate.earliestEffectiveFrom
					? normalizedDate
					: aggregate.earliestEffectiveFrom;
		}
	}
	const slug = String(row.provider_model_slug ?? "").trim();
	if (slug) aggregate.providerSlugSamples.add(slug);
}

function buildStubModel(aggregate: ApiAggregate): Record<string, unknown> {
	const { apiModelId, organisationId } = aggregate;
	const { tail } = splitModelId(apiModelId);
	const nameSource = Array.from(aggregate.providerSlugSamples)[0] ?? tail ?? apiModelId;
	return {
		model_id: apiModelId,
		organisation_id: organisationId,
		name: toTitleName(nameSource),
		status: null,
		previous_model_id: null,
		announced_date: aggregate.earliestEffectiveFrom,
		release_date: aggregate.earliestEffectiveFrom,
		deprecation_date: null,
		retirement_date: null,
		license: null,
		input_types: sortModalities(aggregate.inputModalities).join(",") || null,
		output_types: sortModalities(aggregate.outputModalities).join(",") || null,
		family_id: null,
		links: [],
		details: [],
		benchmarks: [],
	};
}

async function resolveStubFilePath(
	apiModelId: string,
): Promise<string> {
	const { organisationId } = splitModelId(apiModelId);
	const baseDir = join(DIR_MODELS, organisationId);
	await fs.mkdir(baseDir, { recursive: true });

	const initialDirSlug = toDirSlug(apiModelId);
	let candidate = join(baseDir, initialDirSlug, "model.json");
	let index = 2;

	while (true) {
		try {
			const parsed = await readJson<Record<string, unknown>>(candidate);
			const existingId = String(parsed.model_id ?? "").trim();
			if (!existingId || existingId === apiModelId) return candidate;
			const nextSlug = `${initialDirSlug}-${index}`;
			candidate = join(baseDir, nextSlug, "model.json");
			index += 1;
		} catch {
			return candidate;
		}
	}
}

async function writeJsonFile(filePath: string, payload: unknown): Promise<void> {
	await fs.mkdir(dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function escapeCsvCell(value: unknown): string {
	const raw = String(value ?? "");
	if (raw.includes(",") || raw.includes("\"") || raw.includes("\n") || raw.includes("\r")) {
		return `"${raw.replace(/"/g, "\"\"")}"`;
	}
	return raw;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
	if (!rows.length) return "";
	const headers = Object.keys(rows[0]);
	const lines = [headers.map((header) => escapeCsvCell(header)).join(",")];
	for (const row of rows) {
		lines.push(headers.map((header) => escapeCsvCell(row[header])).join(","));
	}
	return `${lines.join("\n")}\n`;
}

async function writeCsvFile(
	filePath: string,
	rows: Array<Record<string, unknown>>,
): Promise<void> {
	await fs.mkdir(dirname(filePath), { recursive: true });
	await fs.writeFile(filePath, toCsv(rows), "utf8");
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const [modelData, providerFiles, organisationIds] = await Promise.all([
		loadExistingModels(),
		loadProviderFiles(args.providerFilter),
		loadOrganisationIds(),
	]);

	const existingModelIds = modelData.modelIdSet;
	const apiAggregates = new Map<string, ApiAggregate>();

	const unresolved: UnresolvedRow[] = [];
	const mappedInternalModelIds = new Set<string>();
	const counts = {
		providerFiles: providerFiles.length,
		providerRows: 0,
		rowsWithApiModelId: 0,
		rowsAlreadyLinked: 0,
		rowsWithBrokenLink: 0,
		candidateMatches: 0,
		autoAppliedLinks: 0,
		fuzzyAppliedLinks: 0,
		unresolvedRows: 0,
		stubsCreated: 0,
		stubsSkippedMissingOrganisation: 0,
	};
	const strategyCounts = new Map<CandidateStrategy, number>();

	for (const file of providerFiles) {
		for (const row of file.rows) {
			counts.providerRows += 1;
			const apiModelId = String(row.api_model_id ?? "").trim();
			if (!apiModelId) continue;
			counts.rowsWithApiModelId += 1;

			const aggregate = ensureApiAggregate(apiAggregates, apiModelId, file.providerId);
			updateAggregate(aggregate, row, file.providerId);

			const currentInternalModelId = String(row.internal_model_id ?? "").trim();
			if (currentInternalModelId && existingModelIds.has(currentInternalModelId)) {
				mappedInternalModelIds.add(currentInternalModelId);
				counts.rowsAlreadyLinked += 1;
				continue;
			}
			if (currentInternalModelId && !existingModelIds.has(currentInternalModelId)) {
				counts.rowsWithBrokenLink += 1;
			}

			const candidate = inferCandidate(row, existingModelIds, modelData.modelsByOrg);
			if (candidate) {
				counts.candidateMatches += 1;
				strategyCounts.set(
					candidate.strategy,
					(strategyCounts.get(candidate.strategy) ?? 0) + 1,
				);
				const canAutoApply = AUTO_APPLY_STRATEGIES.has(candidate.strategy);
				const canApplyFuzzy = args.applyFuzzy && candidate.strategy === "fuzzy_token_unique";
				if (args.write && (canAutoApply || canApplyFuzzy)) {
					row.internal_model_id = candidate.modelId;
					mappedInternalModelIds.add(candidate.modelId);
					file.changed = true;
					if (candidate.strategy === "fuzzy_token_unique") {
						counts.fuzzyAppliedLinks += 1;
					} else {
						counts.autoAppliedLinks += 1;
					}
					continue;
				}
			}

			unresolved.push({
				providerId: file.providerId,
				filePath: file.filePath,
				providerApiModelId: String(row.provider_api_model_id ?? "").trim(),
				apiModelId,
				providerModelSlug: String(row.provider_model_slug ?? "").trim() || null,
				currentInternalModelId: currentInternalModelId || null,
				suggestedModelId: candidate?.modelId ?? null,
				suggestedStrategy: candidate?.strategy ?? null,
				suggestedScore: candidate ? Number(candidate.score.toFixed(4)) : null,
			});
		}
	}

	const unresolvedByApiId = new Map<string, UnresolvedRow[]>();
	for (const row of unresolved) {
		const bucket = unresolvedByApiId.get(row.apiModelId) ?? [];
		bucket.push(row);
		unresolvedByApiId.set(row.apiModelId, bucket);
	}

	const createdStubModelIds = new Set<string>();
	if (args.write && args.createStubs) {
		for (const [apiModelId, rows] of unresolvedByApiId) {
			const hasSuggestion = rows.some((row) => row.suggestedModelId);
			if (hasSuggestion) continue;
			if (existingModelIds.has(apiModelId)) continue;
			const aggregate = apiAggregates.get(apiModelId);
			if (!aggregate) continue;
			if (!organisationIds.has(aggregate.organisationId)) {
				counts.stubsSkippedMissingOrganisation += 1;
				continue;
			}

			const stub = buildStubModel(aggregate);
			const stubPath = await resolveStubFilePath(apiModelId);
			await writeJsonFile(stubPath, stub);
			existingModelIds.add(apiModelId);
			createdStubModelIds.add(apiModelId);
			counts.stubsCreated += 1;
		}

		if (createdStubModelIds.size > 0) {
			for (const file of providerFiles) {
				for (const row of file.rows) {
					const apiModelId = String(row.api_model_id ?? "").trim();
					if (!apiModelId || !createdStubModelIds.has(apiModelId)) continue;
					const currentInternalModelId = String(row.internal_model_id ?? "").trim();
					if (currentInternalModelId) continue;
					row.internal_model_id = apiModelId;
					mappedInternalModelIds.add(apiModelId);
					file.changed = true;
				}
			}
		}
	}

	// Capture mappings after optional write transformations.
	for (const file of providerFiles) {
		for (const row of file.rows) {
			const internalModelId = String(row.internal_model_id ?? "").trim();
			if (internalModelId) mappedInternalModelIds.add(internalModelId);
		}
	}

	if (args.write) {
		for (const file of providerFiles) {
			if (!file.changed) continue;
			await writeJsonFile(file.filePath, file.rows);
		}
	}

	counts.unresolvedRows = unresolved.length;
	const uniqueApiIds = Array.from(apiAggregates.keys());
	const unresolvedUniqueApiIds = new Set(unresolved.map((row) => row.apiModelId));
	const internalModelsWithoutProviderMapping = modelData.models
		.filter((model) => !mappedInternalModelIds.has(model.modelId))
		.sort((a, b) => {
			const byOrg = a.organisationId.localeCompare(b.organisationId);
			if (byOrg !== 0) return byOrg;
			return a.modelId.localeCompare(b.modelId);
		});
	const reportBase = args.reportPath.replace(/\.json$/i, "");
	const csvPaths = {
		linkSuggestions: `${reportBase}-link-suggestions.csv`,
		internalWithoutProviderMapping: `${reportBase}-internal-without-provider-mapping.csv`,
	};

	if (args.exportCsv) {
		const linkSuggestionRows = unresolved
			.map((row) => ({
				provider_id: row.providerId,
				provider_api_model_id: row.providerApiModelId,
				api_model_id: row.apiModelId,
				provider_model_slug: row.providerModelSlug ?? "",
				current_internal_model_id: row.currentInternalModelId ?? "",
				suggested_internal_model_id: row.suggestedModelId ?? "",
				suggested_strategy: row.suggestedStrategy ?? "",
				suggested_score: row.suggestedScore ?? "",
				action: row.suggestedModelId ? "apply_suggested_link" : "manual_review",
				source_file: row.filePath,
			}))
			.sort((a, b) => {
				const byProvider = a.provider_id.localeCompare(b.provider_id);
				if (byProvider !== 0) return byProvider;
				return a.api_model_id.localeCompare(b.api_model_id);
			});
		await writeCsvFile(csvPaths.linkSuggestions, linkSuggestionRows);

		const internalRows = internalModelsWithoutProviderMapping.map((model) => ({
			internal_model_id: model.modelId,
			organisation_id: model.organisationId,
			model_name: model.name,
			api_model_id_same_as_internal_exists: apiAggregates.has(model.modelId) ? "yes" : "no",
			suggested_api_model_id: model.modelId,
		}));
		await writeCsvFile(csvPaths.internalWithoutProviderMapping, internalRows);
	}

	const report = {
		generatedAt: new Date().toISOString(),
		mode: {
			write: args.write,
			createStubs: args.createStubs,
			applyFuzzy: args.applyFuzzy,
			providerFilter: args.providerFilter,
			exportCsv: args.exportCsv,
		},
		counts: {
			...counts,
			uniqueApiModelIdsSeen: uniqueApiIds.length,
			uniqueUnresolvedApiModelIds: unresolvedUniqueApiIds.size,
			internalModelsWithoutProviderMapping: internalModelsWithoutProviderMapping.length,
		},
		strategyCounts: Object.fromEntries(
			Array.from(strategyCounts.entries()).sort((a, b) => a[0].localeCompare(b[0])),
		),
		csvPaths,
		createdStubModelIds: Array.from(createdStubModelIds).sort((a, b) => a.localeCompare(b)),
		unresolved: unresolved
			.sort((a, b) => {
				const byProvider = a.providerId.localeCompare(b.providerId);
				if (byProvider !== 0) return byProvider;
				return a.apiModelId.localeCompare(b.apiModelId);
			}),
	};

	await writeJsonFile(args.reportPath, report);

	console.log(
		[
			`[reconcile-api-model-links] provider_files=${counts.providerFiles}`,
			`provider_rows=${counts.providerRows}`,
			`rows_with_api_model_id=${counts.rowsWithApiModelId}`,
			`already_linked=${counts.rowsAlreadyLinked}`,
			`broken_links=${counts.rowsWithBrokenLink}`,
			`candidate_matches=${counts.candidateMatches}`,
			`auto_applied=${counts.autoAppliedLinks}`,
			`fuzzy_applied=${counts.fuzzyAppliedLinks}`,
			`stubs_created=${counts.stubsCreated}`,
			`unresolved_rows=${counts.unresolvedRows}`,
			`internal_without_provider_mapping=${internalModelsWithoutProviderMapping.length}`,
			`report=${args.reportPath}`,
			args.exportCsv
				? `csv_links=${csvPaths.linkSuggestions}`
				: "csv_links=disabled",
		].join(" "),
	);

	if (!args.write) {
		console.log(
			"[reconcile-api-model-links] Dry run complete. Re-run with --write to apply safe links.",
		);
		if (counts.unresolvedRows > 0) {
			console.log(
				"[reconcile-api-model-links] Optional: add --create-stubs to scaffold unresolved API model IDs that have no suggestion.",
			);
		}
	}
}

main().catch((error) => {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`[reconcile-api-model-links] ${message}`);
	process.exitCode = 1;
});
