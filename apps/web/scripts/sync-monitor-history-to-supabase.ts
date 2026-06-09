import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
	buildHistoryForRange,
	type HistoryEntry,
	type HistoryMeta,
} from "../../../scripts/update-monitor-history";
import { createAdminClient } from "../src/utils/supabase/admin";

type MonitorSyncStateRow = {
	commit_count: number | null;
	entry_count: number | null;
	generated_at: string | null;
	last_sha: string | null;
	source_base: string | null;
	source_head: string | null;
	sync_key: string;
};

const BATCH_SIZE = 500;

function sh(cmd: string): string {
	return execSync(cmd, { encoding: "utf8" }).toString();
}

function loadLocalEnv() {
	const envLoader = (
		process as NodeJS.Process & {
			loadEnvFile?: (path?: string) => void;
		}
	).loadEnvFile;

	if (typeof envLoader !== "function") return;

	for (const fileName of [".env.local", ".env"]) {
		const filePath = path.join(process.cwd(), fileName);
		if (!fs.existsSync(filePath)) continue;
		envLoader(filePath);
	}
}

function humanizeSlug(value: string | null | undefined) {
	const raw = String(value ?? "").trim();
	if (!raw) return "Unknown";

	const overrides: Record<string, string> = {
		ai21: "AI21",
		anthropic: "Anthropic",
		"anthropic-aws": "Anthropic AWS",
		"anthropic-aws-us": "Anthropic AWS US",
		"anthropic-us": "Anthropic US",
		cohere: "Cohere",
		google: "Google",
		meta: "Meta",
		microsoft: "Microsoft",
		mistral: "Mistral",
		openai: "OpenAI",
		"x-ai": "xAI",
		xai: "xAI",
		"z-ai": "Z.ai",
	};

	const override = overrides[raw.toLowerCase()];
	if (override) return override;

	return raw
		.split(/[/_-]+/g)
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function getHeadCommit() {
	return sh("git rev-parse HEAD").trim();
}

function resolveCommitRef(ref: string) {
	return sh(`git rev-parse --verify ${ref}`).trim();
}

function gitCommitExists(commitSha: string) {
	try {
		sh(`git rev-parse --verify ${commitSha}`);
		return true;
	} catch {
		return false;
	}
}

function getProviderSlug(entry: HistoryEntry) {
	if (entry.entityType === "pricing" && entry.entityId?.includes(":")) {
		return entry.entityId.split(":")[0] ?? null;
	}
	if (entry.orgId) return entry.orgId;
	if (entry.model.includes("/")) return entry.model.split("/")[0] ?? null;
	return null;
}

function getModelLabel(modelId: string) {
	const source = modelId.includes("/") ? modelId.split("/").slice(1).join("/") : modelId;
	return humanizeSlug(source);
}

function getChangeKind(entry: HistoryEntry) {
	if (!entry.field || entry.field === "status") return "status";
	if (entry.field === "description") return "description";
	if (entry.field.startsWith("pricing.")) return "pricing";
	if (entry.field.startsWith("benchmarks.")) return "benchmark";
	return "other";
}

function chunk<T>(items: T[], size: number) {
	const result: T[][] = [];
	for (let index = 0; index < items.length; index += size) {
		result.push(items.slice(index, index + size));
	}
	return result;
}

async function fetchAllCommitShas() {
	const supabase = createAdminClient();
	const values: string[] = [];

	for (let from = 0; ; from += 1000) {
		const to = from + 999;
		const { data, error } = await supabase
			.from("monitor_history_commits")
			.select("commit_sha")
			.range(from, to);

		if (error) throw error;

		const page = (data ?? []) as Array<{ commit_sha: string | null }>;
		values.push(...page.map((row) => String(row.commit_sha ?? "").trim()).filter(Boolean));

		if (page.length < 1000) break;
	}

	return values;
}

async function fetchSyncState() {
	const supabase = createAdminClient();
	const { data, error } = await supabase
		.from("monitor_history_sync_state")
		.select(
			"sync_key, source_base, source_head, last_sha, generated_at, commit_count, entry_count",
		)
		.eq("sync_key", "catalog")
		.maybeSingle();

	if (error) throw error;
	return (data ?? null) as MonitorSyncStateRow | null;
}

async function fetchTotals() {
	const supabase = createAdminClient();
	const [
		{ count: commitCount, error: commitError },
		{ count: eventCount, error: eventError },
	] = await Promise.all([
		supabase.from("monitor_history_commits").select("*", { count: "exact", head: true }),
		supabase.from("monitor_history_events").select("*", { count: "exact", head: true }),
	]);

	if (commitError) throw commitError;
	if (eventError) throw eventError;

	return {
		commitCount: Number(commitCount ?? 0),
		eventCount: Number(eventCount ?? 0),
	};
}

async function deleteEventsForCommits(commitShas: string[]) {
	if (commitShas.length === 0) return;

	const supabase = createAdminClient();
	for (const batch of chunk(commitShas, BATCH_SIZE)) {
		const { error } = await supabase
			.from("monitor_history_events")
			.delete()
			.in("commit_sha", batch);

		if (error) throw error;
	}
}

async function upsertCommits(
	rows: Array<{ commit_sha: string; committed_at: string; entry_count: number }>,
) {
	if (rows.length === 0) return;

	const supabase = createAdminClient();
	const nowIso = new Date().toISOString();
	for (const batch of chunk(rows, BATCH_SIZE)) {
		const { error } = await supabase.from("monitor_history_commits").upsert(
			batch.map((row) => ({
				...row,
				updated_at: nowIso,
			})),
			{ onConflict: "commit_sha" },
		);

		if (error) throw error;
	}
}

async function insertEvents(rows: Array<Record<string, unknown>>) {
	if (rows.length === 0) return;

	const supabase = createAdminClient();
	for (const batch of chunk(rows, BATCH_SIZE)) {
		const { error } = await supabase.from("monitor_history_events").insert(batch);
		if (error) throw error;
	}
}

async function deleteMissingCommits(activeCommitShas: string[]) {
	const existingCommitShas = await fetchAllCommitShas();
	const active = new Set(activeCommitShas);
	const stale = existingCommitShas.filter((commitSha) => !active.has(commitSha));
	if (stale.length === 0) return;

	const supabase = createAdminClient();
	for (const batch of chunk(stale, BATCH_SIZE)) {
		const { error } = await supabase
			.from("monitor_history_commits")
			.delete()
			.in("commit_sha", batch);

		if (error) throw error;
	}
}

async function upsertSyncState(
	meta: Pick<HistoryMeta, "generatedAt" | "lastSha"> & {
		sourceBase: string | null;
		sourceHead: string | null;
	},
	entryCount: number,
	commitCount: number,
) {
	const supabase = createAdminClient();
	const { error } = await supabase.from("monitor_history_sync_state").upsert(
		{
			commit_count: commitCount,
			entry_count: entryCount,
			generated_at: meta.generatedAt ?? null,
			last_sha: meta.lastSha ?? null,
			source_base: meta.sourceBase,
			source_head: meta.sourceHead,
			sync_key: "catalog",
			updated_at: new Date().toISOString(),
		},
		{ onConflict: "sync_key" },
	);

	if (error) throw error;
}

function buildCommitRows(entries: HistoryEntry[]) {
	const entryCountByCommit = new Map<string, number>();

	for (const entry of entries) {
		const commitSha = String(entry.commit ?? "").trim();
		if (!commitSha) continue;
		entryCountByCommit.set(commitSha, (entryCountByCommit.get(commitSha) ?? 0) + 1);
	}

	return Array.from(entryCountByCommit.entries()).map(([commitSha, entryCount]) => {
		const committedAt =
			entries.find((entry) => entry.commit === commitSha)?.timestamp ?? new Date().toISOString();
		return {
			commit_sha: commitSha,
			committed_at: new Date(committedAt).toISOString(),
			entry_count: entryCount,
		};
	});
}

function buildEventRows(entries: HistoryEntry[]) {
	const nowIso = new Date().toISOString();

	return entries
		.filter((entry) => entry.commit)
		.map((entry) => {
			const providerSlug = getProviderSlug(entry);
			return {
				action: entry.action ?? null,
				change_kind: getChangeKind(entry),
				commit_sha: String(entry.commit),
				committed_at: new Date(entry.timestamp).toISOString(),
				entity_id: entry.entityId ?? null,
				entity_type: entry.entityType ?? null,
				endpoint: entry.endpoint ?? null,
				event_id: entry.id,
				field: entry.field ?? "",
				model_id: entry.model,
				model_label: getModelLabel(entry.model),
				new_value: entry.newValue ?? null,
				old_value: entry.oldValue ?? null,
				org_id: entry.orgId ?? null,
				percent_change:
					typeof entry.percentChange === "number" ? entry.percentChange : null,
				provider_kind: entry.provider,
				provider_label: humanizeSlug(providerSlug ?? entry.provider),
				provider_slug: providerSlug,
				source_file: entry.file ?? null,
				updated_at: nowIso,
			};
		});
}

function resolveFullRebuildBase(
	currentState: MonitorSyncStateRow | null,
	explicitBase: string | null,
) {
	const envBase = process.env.MONITOR_HISTORY_BASE_SHA?.trim() || null;
	return explicitBase || currentState?.source_base || currentState?.last_sha || envBase;
}

function parseArgs() {
	const args = process.argv.slice(2);
	const fullRebuild = args.includes("--full-rebuild");
	const fromIndex = args.findIndex((arg) => arg === "--from");
	const headIndex = args.findIndex((arg) => arg === "--head");
	const explicitBase =
		fromIndex >= 0 ? (args[fromIndex + 1] ?? "").trim() || null : null;
	const headRef = headIndex >= 0 ? (args[headIndex + 1] ?? "").trim() || "HEAD" : "HEAD";
	return { explicitBase, fullRebuild, headRef };
}

async function syncIncremental(currentState: MonitorSyncStateRow, head: string) {
	const lastSha = String(currentState.last_sha ?? "").trim();
	if (!lastSha) {
		throw new Error(
			"Monitor sync state has no last_sha. Run sync-monitor-history-to-supabase.ts --full-rebuild first.",
		);
	}
	if (!gitCommitExists(lastSha)) {
		throw new Error(
			`Monitor sync state points at missing commit ${lastSha}. Run sync-monitor-history-to-supabase.ts --full-rebuild to repair history.`,
		);
	}
	if (lastSha === head) {
		const totals = await fetchTotals();
		await upsertSyncState(
			{
				generatedAt: new Date().toISOString(),
				lastSha: head,
				sourceBase: currentState.source_base,
				sourceHead: head,
			},
			totals.eventCount,
			totals.commitCount,
		);
		process.stdout.write("Monitor history already synced to HEAD.\n");
		return;
	}

	const result = buildHistoryForRange(lastSha, head);
	const commitRows = buildCommitRows(result.entries);
	const eventRows = buildEventRows(result.entries);

	if (commitRows.length > 0) {
		await upsertCommits(commitRows);
		await deleteEventsForCommits(commitRows.map((row) => row.commit_sha));
		await insertEvents(eventRows);
	}

	const totals = await fetchTotals();
	await upsertSyncState(
		{
			generatedAt: result.meta.generatedAt,
			lastSha: head,
			sourceBase: currentState.source_base,
			sourceHead: head,
		},
		totals.eventCount,
		totals.commitCount,
	);

	process.stdout.write(
		commitRows.length === 0
			? `Processed ${result.commits.length} commit(s); no tracked monitor events changed.\n`
			: `Synced ${eventRows.length} monitor events across ${commitRows.length} commit(s) to Supabase.\n`,
	);
}

async function syncFullRebuild(currentState: MonitorSyncStateRow | null, explicitBase: string | null, head: string) {
	const base = resolveFullRebuildBase(currentState, explicitBase);
	if (!base) {
		throw new Error(
			"Could not determine a full rebuild base SHA. Pass --from <sha> or set MONITOR_HISTORY_BASE_SHA.",
		);
	}
	if (!gitCommitExists(base)) {
		throw new Error(`Full rebuild base commit ${base} does not exist in this checkout.`);
	}

	const result = buildHistoryForRange(base, head);
	const commitRows = buildCommitRows(result.entries);
	const eventRows = buildEventRows(result.entries);

	await upsertCommits(commitRows);
	await deleteEventsForCommits(commitRows.map((row) => row.commit_sha));
	await insertEvents(eventRows);
	await deleteMissingCommits(commitRows.map((row) => row.commit_sha));

	const totals = await fetchTotals();
	await upsertSyncState(
		{
			generatedAt: result.meta.generatedAt,
			lastSha: head,
			sourceBase: base,
			sourceHead: head,
		},
		totals.eventCount,
		totals.commitCount,
	);

	process.stdout.write(
		`Rebuilt and synced ${eventRows.length} monitor events across ${commitRows.length} commit(s) to Supabase.\n`,
	);
}

async function main() {
	loadLocalEnv();

	const { explicitBase, fullRebuild, headRef } = parseArgs();
	const head = headRef === "HEAD" ? getHeadCommit() : resolveCommitRef(headRef);
	const currentState = await fetchSyncState();

	if (fullRebuild || !currentState) {
		await syncFullRebuild(currentState, explicitBase, head);
		return;
	}

	const lastSha = String(currentState.last_sha ?? "").trim();
	if (lastSha && !gitCommitExists(lastSha)) {
		await syncFullRebuild(currentState, explicitBase, head);
		return;
	}

	await syncIncremental(currentState, head);
}

void main().catch((error) => {
	const message =
		error instanceof Error
			? error.message
			: typeof error === "object" && error !== null
				? JSON.stringify(error)
				: String(error);
	process.stderr.write(`${message}\n`);
	process.exitCode = 1;
});
