export type ExperimentsCouncilRunStatus =
	| "local_pending"
	| "queued"
	| "running_sources"
	| "awaiting_synthesis"
	| "running_analysis"
	| "running_fusion"
	| "completed"
	| "partial"
	| "failed";

export type ExperimentsCouncilPresetRecord = {
	id?: number;
	key: string;
	name: string;
	description: string;
	sourceModels: string[];
	synthesisModelSlug: string | null;
	isSystem: boolean;
	createdAt: string;
	updatedAt: string;
};

export type ExperimentsCouncilCustomPresetRecord = {
	id?: number;
	name: string;
	description: string;
	sourceModels: string[];
	synthesisModelSlug: string | null;
	createdAt: string;
	updatedAt: string;
};

export type ExperimentsCouncilRunRecord = {
	id?: number;
	createdAt: string;
	updatedAt: string;
	remoteRunId: string | null;
	isComplete: boolean;
	isSynthesised: boolean;
	modelSlugs: string[];
	presetId: number | null;
	originalPrompt: string;
	responsesByModel: Record<string, string>;
	analysisFindings: Record<string, unknown> | null;
	synthesisedContent: string | null;
	synthesisedModelSlug: string | null;
	sourceResults: Array<{
		child_index: number;
		model_id: string;
		status: "completed" | "failed";
		output_text: string | null;
		output_tokens?: number | null;
		latency_ms: number;
		error: string | null;
	}>;
	status: ExperimentsCouncilRunStatus;
	error: string | null;
	runSnapshot: Record<string, unknown> | null;
};

const DB_NAME = "ai-stats-experiments-council";
const DB_VERSION = 3;

const PRESETS_STORE = "presets";
const CUSTOM_PRESETS_STORE = "custom_presets";
const RUNS_STORE = "runs";

const PRESET_KEY_INDEX = "key";
const CUSTOM_PRESET_CREATED_AT_INDEX = "createdAt";
const RUN_CREATED_AT_INDEX = "createdAt";
const RUN_REMOTE_ID_INDEX = "remoteRunId";

const DEFAULT_INTELLIGENCE_CANDIDATES = [
	"anthropic/claude-opus-4.6",
	"openai/gpt-5.4",
	"google/gemini-3.1-pro-preview",
];

const DEFAULT_BUDGET_CANDIDATES = [
	"minimax/minimax-m3",
	"deepseek/deepseek-v4-flash",
	"moonshotai/kimi-k2.6",
];

const PREVIOUS_BUDGET_CANDIDATES = [
	"minimax/minimax-m2.7",
	"deepseek/deepseek-v3.2",
	"moonshotai/kimi-k2.5",
];

const LEGACY_INTELLIGENCE_CANDIDATES = [
	"openai/gpt-5-mini",
	"anthropic/claude-3.7-sonnet",
	"google/gemini-2.5-pro",
	"openai/gpt-4.1-mini",
];

const LEGACY_BUDGET_CANDIDATES = [
	"openai/gpt-4.1-mini",
	"openai/gpt-5-mini",
	"google/gemini-2.5-pro",
];

const LEGACY_DEFAULT_MODEL_SET = new Set([
	...LEGACY_INTELLIGENCE_CANDIDATES,
	...LEGACY_BUDGET_CANDIDATES,
]);

function clampModelList(models: string[]): string[] {
	const deduped: string[] = [];
	for (const model of models) {
		const trimmed = model.trim();
		if (!trimmed || deduped.includes(trimmed)) continue;
		deduped.push(trimmed);
		if (deduped.length >= 4) break;
	}
	return deduped;
}

function matchesExactModelList(models: string[], expected: string[]): boolean {
	return (
		models.length === expected.length &&
		models.every((model, index) => model === expected[index])
	);
}

function isConstraintError(error: unknown): boolean {
	if (error instanceof DOMException) return error.name === "ConstraintError";
	return (
		error instanceof Error &&
		(error.name === "ConstraintError" ||
			/uniqueness requirements|constraint/i.test(error.message))
	);
}

function dedupePresetStoreAndEnsureUniqueKeyIndex(presetStore: IDBObjectStore) {
	if (presetStore.indexNames.contains(PRESET_KEY_INDEX)) {
		const keyIndex = presetStore.index(PRESET_KEY_INDEX);
		if (keyIndex.unique) return;
		presetStore.deleteIndex(PRESET_KEY_INDEX);
	}

	const seenKeys = new Set<string>();
	const cursorRequest = presetStore.openCursor();
	cursorRequest.onsuccess = () => {
		const cursor = cursorRequest.result;
		if (!cursor) {
			presetStore.createIndex(PRESET_KEY_INDEX, "key", { unique: true });
			return;
		}
		const row = cursor.value as Partial<ExperimentsCouncilPresetRecord>;
		const normalizedKey = typeof row.key === "string" ? row.key.trim() : "";
		if (!normalizedKey || seenKeys.has(normalizedKey)) {
			cursor.delete();
			cursor.continue();
			return;
		}
		seenKeys.add(normalizedKey);
		cursor.continue();
	};
}

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		if (typeof window === "undefined") {
			reject(new Error("IndexedDB is only available in the browser."));
			return;
		}

		const request = window.indexedDB.open(DB_NAME, DB_VERSION);
		request.onerror = () => reject(request.error ?? new Error("IndexedDB error"));
		request.onupgradeneeded = () => {
			const db = request.result;

			const presetStore = db.objectStoreNames.contains(PRESETS_STORE)
				? request.transaction?.objectStore(PRESETS_STORE)
				: db.createObjectStore(PRESETS_STORE, {
						keyPath: "id",
						autoIncrement: true,
					});
			if (presetStore) {
				dedupePresetStoreAndEnsureUniqueKeyIndex(presetStore);
			}

			const customPresetStore = db.objectStoreNames.contains(CUSTOM_PRESETS_STORE)
				? request.transaction?.objectStore(CUSTOM_PRESETS_STORE)
				: db.createObjectStore(CUSTOM_PRESETS_STORE, {
						keyPath: "id",
						autoIncrement: true,
					});
			if (customPresetStore && !customPresetStore.indexNames.contains(CUSTOM_PRESET_CREATED_AT_INDEX)) {
				customPresetStore.createIndex(CUSTOM_PRESET_CREATED_AT_INDEX, "createdAt", { unique: false });
			}

			const runStore = db.objectStoreNames.contains(RUNS_STORE)
				? request.transaction?.objectStore(RUNS_STORE)
				: db.createObjectStore(RUNS_STORE, {
						keyPath: "id",
						autoIncrement: true,
					});
			if (runStore && !runStore.indexNames.contains(RUN_CREATED_AT_INDEX)) {
				runStore.createIndex(RUN_CREATED_AT_INDEX, "createdAt", { unique: false });
			}
			if (runStore && !runStore.indexNames.contains(RUN_REMOTE_ID_INDEX)) {
				runStore.createIndex(RUN_REMOTE_ID_INDEX, "remoteRunId", { unique: false });
			}
		};
		request.onsuccess = () => resolve(request.result);
	});
}

async function withStore<T>(
	storeName: string,
	mode: IDBTransactionMode,
	fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(storeName, mode);
		const store = tx.objectStore(storeName);
		const request = fn(store);
		request.onerror = () => reject(request.error ?? new Error("IndexedDB error"));
		request.onsuccess = () => resolve(request.result);
	});
}

async function getPresetByKey(
	key: string,
): Promise<ExperimentsCouncilPresetRecord | null> {
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(PRESETS_STORE, "readonly");
		const store = tx.objectStore(PRESETS_STORE);
		const index = store.index(PRESET_KEY_INDEX);
		const request = index.get(key);
		request.onerror = () => reject(request.error ?? new Error("IndexedDB error"));
		request.onsuccess = () => {
			resolve((request.result as ExperimentsCouncilPresetRecord | undefined) ?? null);
		};
	});
}

function pickModels(
	candidates: string[],
	available: string[],
	fallback: string[],
): string[] {
	const source = available.length > 0 ? available : fallback;
	const picked = candidates.filter((model) => source.includes(model)).slice(0, 4);
	if (picked.length > 0) return picked;
	return source.slice(0, Math.min(3, source.length));
}

export async function listExperimentsCouncilPresets(): Promise<ExperimentsCouncilPresetRecord[]> {
	const records = await withStore<ExperimentsCouncilPresetRecord[]>(
		PRESETS_STORE,
		"readonly",
		(store) => store.getAll(),
	);
	const safe = Array.isArray(records) ? records : [];
	return safe.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function listExperimentsCouncilCustomPresets(): Promise<ExperimentsCouncilCustomPresetRecord[]> {
	const records = await withStore<ExperimentsCouncilCustomPresetRecord[]>(
		CUSTOM_PRESETS_STORE,
		"readonly",
		(store) => store.getAll(),
	);
	const safe = Array.isArray(records) ? records : [];
	return safe.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function saveExperimentsCouncilPreset(
	preset: ExperimentsCouncilPresetRecord,
): Promise<ExperimentsCouncilPresetRecord> {
	const normalized: ExperimentsCouncilPresetRecord = {
		...preset,
		sourceModels: clampModelList(preset.sourceModels),
		updatedAt: new Date().toISOString(),
	};
	const result = await withStore<IDBValidKey>(
		PRESETS_STORE,
		"readwrite",
		(store) => store.put(normalized),
	);
	return {
		...normalized,
		id: Number(result),
	};
}

export async function createExperimentsCouncilCustomPreset(
	preset: Omit<ExperimentsCouncilCustomPresetRecord, "id">,
): Promise<ExperimentsCouncilCustomPresetRecord> {
	const normalized: Omit<ExperimentsCouncilCustomPresetRecord, "id"> = {
		...preset,
		sourceModels: clampModelList(preset.sourceModels),
		updatedAt: new Date().toISOString(),
	};
	const key = await withStore<IDBValidKey>(
		CUSTOM_PRESETS_STORE,
		"readwrite",
		(store) => store.add(normalized),
	);
	return {
		...normalized,
		id: Number(key),
	};
}

export async function saveExperimentsCouncilCustomPreset(
	preset: ExperimentsCouncilCustomPresetRecord,
): Promise<ExperimentsCouncilCustomPresetRecord> {
	const normalized: ExperimentsCouncilCustomPresetRecord = {
		...preset,
		sourceModels: clampModelList(preset.sourceModels),
		updatedAt: new Date().toISOString(),
	};
	const key = await withStore<IDBValidKey>(
		CUSTOM_PRESETS_STORE,
		"readwrite",
		(store) => store.put(normalized),
	);
	return {
		...normalized,
		id: Number(key),
	};
}

export async function deleteExperimentsCouncilCustomPreset(id: number): Promise<void> {
	await withStore(
		CUSTOM_PRESETS_STORE,
		"readwrite",
		(store) => store.delete(id),
	);
}

export async function ensureExperimentsCouncilPresets(
	modelOptions: string[],
	fallbackModels: string[] = [
		"anthropic/claude-opus-4.6",
		"openai/gpt-5.4",
		"google/gemini-3.1-pro-preview",
		"minimax/minimax-m3",
		"deepseek/deepseek-v4-flash",
		"moonshotai/kimi-k2.6",
	],
): Promise<ExperimentsCouncilPresetRecord[]> {
	const available = modelOptions.length > 0 ? modelOptions : fallbackModels;
	const nowIso = new Date().toISOString();
	const defaults: Array<Omit<ExperimentsCouncilPresetRecord, "id">> = [
		{
			key: "intelligence",
			name: "Intelligence",
			description: "High-reasoning model blend for depth and nuance.",
			sourceModels: pickModels(
				DEFAULT_INTELLIGENCE_CANDIDATES,
				available,
				fallbackModels,
			),
			synthesisModelSlug: null,
			isSystem: true,
			createdAt: nowIso,
			updatedAt: nowIso,
		},
		{
			key: "budget",
			name: "Budget",
			description: "Lower-cost blend optimized for fast iteration.",
			sourceModels: pickModels(DEFAULT_BUDGET_CANDIDATES, available, fallbackModels),
			synthesisModelSlug: null,
			isSystem: true,
			createdAt: nowIso,
			updatedAt: nowIso,
		},
		{
			key: "custom",
			name: "Custom",
			description: "Manually choose up to four source models.",
			sourceModels: [],
			synthesisModelSlug: null,
			isSystem: false,
			createdAt: nowIso,
			updatedAt: nowIso,
		},
	];

	for (const preset of defaults) {
		const existing = await getPresetByKey(preset.key);
		if (existing) {
			const intelligenceIsLegacy =
				preset.key === "intelligence" &&
				existing.sourceModels.length > 0 &&
				existing.sourceModels.every((modelId) =>
					LEGACY_INTELLIGENCE_CANDIDATES.includes(modelId),
				);
			const budgetIsLegacy =
				preset.key === "budget" &&
				(matchesExactModelList(existing.sourceModels, LEGACY_BUDGET_CANDIDATES) ||
					matchesExactModelList(existing.sourceModels, PREVIOUS_BUDGET_CANDIDATES));
			const customIsLegacy =
				preset.key === "custom" &&
				existing.sourceModels.length === 1 &&
				existing.synthesisModelSlug === existing.sourceModels[0] &&
				LEGACY_DEFAULT_MODEL_SET.has(existing.sourceModels[0]);
			if (intelligenceIsLegacy || budgetIsLegacy || customIsLegacy) {
				await withStore(PRESETS_STORE, "readwrite", (store) =>
					store.put({
						...existing,
						description: preset.description,
						sourceModels: preset.sourceModels,
						synthesisModelSlug:
							preset.synthesisModelSlug ??
							preset.sourceModels[0] ??
							available[0] ??
							null,
						isSystem: preset.isSystem,
						updatedAt: nowIso,
					}),
				);
			}
			continue;
		}
		try {
			await withStore(PRESETS_STORE, "readwrite", (store) => store.add(preset));
		} catch (error) {
			if (!isConstraintError(error)) throw error;
		}
	}

	const presets = await listExperimentsCouncilPresets();
	return presets.map((preset) => ({
		...preset,
		sourceModels: clampModelList(preset.sourceModels),
		synthesisModelSlug:
			preset.synthesisModelSlug ?? preset.sourceModels[0] ?? available[0] ?? null,
	}));
}

export async function listExperimentsCouncilRuns(): Promise<ExperimentsCouncilRunRecord[]> {
	const records = await withStore<ExperimentsCouncilRunRecord[]>(
		RUNS_STORE,
		"readonly",
		(store) => store.getAll(),
	);
	const safe = Array.isArray(records) ? records : [];
	return safe.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createExperimentsCouncilRun(
	run: Omit<ExperimentsCouncilRunRecord, "id">,
): Promise<ExperimentsCouncilRunRecord> {
	const normalized: Omit<ExperimentsCouncilRunRecord, "id"> = {
		...run,
		modelSlugs: clampModelList(run.modelSlugs),
		updatedAt: new Date().toISOString(),
	};
	const key = await withStore<IDBValidKey>(
		RUNS_STORE,
		"readwrite",
		(store) => store.add(normalized),
	);
	return {
		...normalized,
		id: Number(key),
	};
}

export async function saveExperimentsCouncilRun(
	run: ExperimentsCouncilRunRecord,
): Promise<ExperimentsCouncilRunRecord> {
	const normalized: ExperimentsCouncilRunRecord = {
		...run,
		modelSlugs: clampModelList(run.modelSlugs),
		updatedAt: new Date().toISOString(),
	};
	const key = await withStore<IDBValidKey>(
		RUNS_STORE,
		"readwrite",
		(store) => store.put(normalized),
	);
	return {
		...normalized,
		id: Number(key),
	};
}

