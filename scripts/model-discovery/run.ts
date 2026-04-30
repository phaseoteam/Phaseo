import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createAdminClient } from "../../apps/web/src/utils/supabase/admin";
import { getProviderDiscoveryRule } from "./providers/discovery-policy";
import type { ProviderDefinition, ProviderModel } from "./providers/_shared";
import { asRecord, getMissingEnvVars, sortKeysDeep } from "./providers/_shared";

type ProviderSnapshot = {
    providerId: string;
    providerName: string;
    fetchedAt: string;
    modelCount: number;
    models: Record<string, unknown>;
};

type DiscoveryState = {
    version: 1;
    generatedAt: string;
    providers: Record<string, ProviderSnapshot>;
};

type ProviderDiff = {
    providerId: string;
    providerName: string;
    previousCount: number;
    currentCount: number;
    added: string[];
    removed: string[];
    changed: string[];
};

type ProviderChangeSet = ProviderDiff & {
    platformId: string;
    platformName: string;
};

type ProviderChangeEntry = {
    id: string;
    ts: string;
    action: "create" | "update" | "delete";
    platformId: string;
    platformName: string;
    providerId: string;
    providerName: string;
    modelId: string;
};

type ProviderRunResult =
    | {
          providerId: string;
          providerName: string;
          status: "success";
          durationMs: number;
          modelCount: number;
          diff: ProviderDiff | null;
      }
    | {
          providerId: string;
          providerName: string;
          status: "skipped";
          reason: string;
      }
    | {
          providerId: string;
          providerName: string;
          status: "error";
          durationMs: number;
          reason: string;
      };

function isProviderDefinition(value: unknown): value is ProviderDefinition {
    return (
        typeof value === "object" &&
        value !== null &&
        typeof (value as ProviderDefinition).id === "string" &&
        (typeof (value as ProviderDefinition).name === "string" || typeof (value as ProviderDefinition).name === "undefined") &&
        typeof (value as ProviderDefinition).fetchModels === "function"
    );
}

function unwrapDefaultExport(value: unknown): unknown {
    let current = value;
    const seen = new Set<unknown>();

    while (
        current &&
        typeof current === "object" &&
        !Array.isArray(current) &&
        "default" in (current as Record<string, unknown>)
    ) {
        if (seen.has(current)) {
            break;
        }
        seen.add(current);

        const keys = Object.keys(current as Record<string, unknown>);
        if (keys.length !== 1) {
            break;
        }

        current = (current as { default: unknown }).default;
    }

    return current;
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROVIDERS_DIR = path.join(SCRIPT_DIR, "providers");
const STATE_DIR = path.join(SCRIPT_DIR, "state");
const STATE_PATH = path.join(STATE_DIR, "provider-model-snapshots.json");
const REPORT_PATH = path.join(STATE_DIR, "last-run-report.json");
const CHANGE_FEED_PATH = path.join(STATE_DIR, "provider-change-feed.jsonl");
const MAX_CHANGE_FEED_ENTRIES = 5000;
const MAX_DISCORD_EVENT_LINES = 25;
const UPSERT_BATCH_SIZE = 500;

type RunStatus = "running" | "completed" | "completed_with_errors" | "failed";

type SeenModelUpsertRow = {
    provider_id: string;
    provider_name: string;
    model_id: string;
    model_details: Record<string, unknown>;
    pricing_details: unknown;
    last_seen_at: string;
    last_run_id: string;
};

type SeenModelDeleteRow = {
    provider_id: string;
    model_id: string;
};

type ApiProviderModelAllowlistRow = {
    provider_id: string | null;
    provider_model_slug: string | null;
    api_model_id: string | null;
};

function canonicalModelKey(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, "");
}

async function loadApiModelAllowlistByProvider(): Promise<Map<string, Set<string>>> {
    const client = createAdminClient();
    const map = new Map<string, Set<string>>();
    const pageSize = 1000;
    let from = 0;

    while (true) {
        const { data, error } = await client
            .from("data_api_provider_models")
            .select("provider_id, provider_model_slug, api_model_id")
            .range(from, from + pageSize - 1);

        if (error) {
            throw new Error(error.message || "Failed to load allowlist from data_api_provider_models");
        }

        const rows = (data ?? []) as ApiProviderModelAllowlistRow[];
        if (rows.length === 0) {
            break;
        }

        for (const row of rows) {
            if (!row.provider_id) continue;
            const providerId = row.provider_id;
            const allowlist = map.get(providerId) ?? new Set<string>();

            if (typeof row.provider_model_slug === "string" && row.provider_model_slug.trim()) {
                allowlist.add(canonicalModelKey(row.provider_model_slug));
            }

            if (typeof row.api_model_id === "string" && row.api_model_id.includes("/")) {
                const tail = row.api_model_id.split("/").slice(1).join("/");
                if (tail.trim()) {
                    allowlist.add(canonicalModelKey(tail));
                }
            }

            map.set(providerId, allowlist);
        }

        if (rows.length < pageSize) {
            break;
        }

        from += pageSize;
    }

    return map;
}

function parseEnvFileContents(raw: string): Record<string, string> {
    const out: Record<string, string> = {};
    const lines = raw.split(/\r?\n/);

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const withoutExport = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
        const eq = withoutExport.indexOf("=");
        if (eq <= 0) continue;

        const key = withoutExport.slice(0, eq).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

        let value = withoutExport.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        out[key] = value;
    }

    return out;
}

function loadLocalEnvFiles(): string[] {
    const root = process.cwd();
    const candidates = [
        path.join(root, "dev.env"),
        path.join(root, ".env"),
        path.join(root, ".dev.vars"),
        path.join(root, "dev.vars"),
        path.join(root, ".env.locals"),
        path.join(root, ".env.local"),
        path.join(root, "scripts", "model-discovery", ".dev.vars"),
        path.join(root, "scripts", "model-discovery", "dev.env"),
        path.join(root, "scripts", "model-discovery", ".env"),
        path.join(root, "apps", "api", ".dev.vars"),
        path.join(root, "apps", "api", "dev.vars"),
        path.join(root, "apps", "api", ".env.locals"),
        path.join(root, "apps", "api", ".env.local"),
        path.join(root, "apps", "api", ".env"),
        path.join(root, "apps", "web", ".dev.vars"),
        path.join(root, "apps", "web", "dev.vars"),
        path.join(root, "apps", "web", ".env.locals"),
        path.join(root, "apps", "web", ".env.local"),
        path.join(root, "apps", "web", ".env"),
        path.join(SCRIPT_DIR, ".dev.vars"),
        path.join(SCRIPT_DIR, "dev.vars"),
        path.join(SCRIPT_DIR, "dev.env"),
        path.join(SCRIPT_DIR, ".env.locals"),
        path.join(SCRIPT_DIR, ".env.local"),
        path.join(SCRIPT_DIR, ".env"),
    ];

    const loaded: string[] = [];
    const seen = new Set<string>();

    for (const filePath of candidates) {
        const normalizedPath = path.normalize(filePath);
        if (seen.has(normalizedPath)) continue;
        seen.add(normalizedPath);

        if (!fs.existsSync(filePath)) continue;
        try {
            const parsed = parseEnvFileContents(fs.readFileSync(filePath, "utf-8"));
            for (const [key, value] of Object.entries(parsed)) {
                if (process.env[key] === undefined) {
                    process.env[key] = value;
                }
            }
            loaded.push(path.relative(root, filePath));
        } catch {
            // Best-effort local loading only; hard failures would be noisy.
        }
    }

    return loaded;
}

function nowIso(): string {
    return new Date().toISOString();
}

function emptyState(): DiscoveryState {
    return {
        version: 1,
        generatedAt: nowIso(),
        providers: {},
    };
}

function readState(filePath: string): DiscoveryState {
    if (!fs.existsSync(filePath)) {
        return emptyState();
    }

    try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw) as Partial<DiscoveryState>;
        if (parsed.version !== 1 || !parsed.providers || typeof parsed.providers !== "object") {
            return emptyState();
        }
        return {
            version: 1,
            generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : nowIso(),
            providers: parsed.providers as Record<string, ProviderSnapshot>,
        };
    } catch {
        return emptyState();
    }
}

function writeJson(filePath: string, value: unknown): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function normalizeProviderModels(models: ProviderModel[]): Record<string, unknown> {
    const output: Record<string, unknown> = {};
    for (const model of models) {
        output[model.id] = sortKeysDeep(model.payload);
    }
    return output;
}

function jsonEqual(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

function hasMeaningfulModelChange(
    providerId: string,
    previousModelPayload: unknown,
    currentModelPayload: unknown
): boolean {
    if (providerId !== "crofai") {
        return !jsonEqual(previousModelPayload, currentModelPayload);
    }

    const previousPricing = extractPricingDetails(asRecord(previousModelPayload) ?? {});
    const currentPricing = extractPricingDetails(asRecord(currentModelPayload) ?? {});
    return !jsonEqual(previousPricing, currentPricing);
}

function diffSnapshots(previous: ProviderSnapshot | undefined, current: ProviderSnapshot): ProviderDiff | null {
    if (!previous) {
        return null;
    }

    const previousModels = previous?.models ?? {};
    const currentModels = current.models;

    const previousIds = new Set(Object.keys(previousModels));
    const currentIds = new Set(Object.keys(currentModels));

    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];

    for (const id of Array.from(currentIds).sort()) {
        if (!previousIds.has(id)) {
            added.push(id);
            continue;
        }
        if (hasMeaningfulModelChange(current.providerId, previousModels[id], currentModels[id])) {
            changed.push(id);
        }
    }

    for (const id of Array.from(previousIds).sort()) {
        if (!currentIds.has(id)) {
            removed.push(id);
        }
    }

    if (added.length === 0 && removed.length === 0 && changed.length === 0) {
        return null;
    }

    return {
        providerId: current.providerId,
        providerName: current.providerName,
        previousCount: Object.keys(previousModels).length,
        currentCount: Object.keys(currentModels).length,
        added,
        removed,
        changed,
    };
}

function filterDiffByAllowlist(diff: ProviderDiff | null, allowlist: Set<string> | undefined): ProviderDiff | null {
    if (!diff) {
        return null;
    }

    if (!allowlist || allowlist.size === 0) {
        return diff;
    }

    const filterIds = (ids: string[]): string[] => ids.filter((id) => allowlist.has(canonicalModelKey(id)));

    const added = filterIds(diff.added);
    const removed = filterIds(diff.removed);
    const changed = filterIds(diff.changed);

    if (added.length === 0 && removed.length === 0 && changed.length === 0) {
        return null;
    }

    return {
        ...diff,
        added,
        removed,
        changed,
    };
}

function extractPricingDetails(modelPayload: Record<string, unknown>): unknown {
    const candidateKeys = ["pricing", "prices", "cost", "costs", "billing", "rates"];
    for (const key of candidateKeys) {
        if (key in modelPayload) {
            return sortKeysDeep(modelPayload[key]);
        }
    }
    return null;
}

async function insertRunStart(runId: string, startedAtIso: string, providersTotal: number): Promise<void> {
    const client = createAdminClient();
    const { error } = await client.from("model_discovery_runs").insert({
        id: runId,
        trigger: "scheduled",
        source: "github-actions:check-new-models",
        scheduled_at: startedAtIso,
        status: "running",
        started_at: startedAtIso,
        providers_total: providersTotal,
    });

    if (error) {
        throw new Error(error.message || "Failed to insert model_discovery_runs start row");
    }
}

async function updateRunFinish(
    runId: string,
    status: RunStatus,
    summary: {
        startedAtIso: string;
        finishedAtIso: string;
        providersTotal: number;
        providersSuccess: number;
        providersSkipped: number;
        providersError: number;
        changesCount: number;
        staleModelsDeleted: number;
        reportPath: string;
        changeFeedPath: string;
        changeFeedNewEntries: number;
    },
    errorMessage?: string
): Promise<void> {
    const client = createAdminClient();
    const payload = {
        status,
        started_at: summary.startedAtIso,
        finished_at: summary.finishedAtIso,
        providers_total: summary.providersTotal,
        providers_success: summary.providersSuccess,
        providers_skipped: summary.providersSkipped,
        providers_error: summary.providersError,
        changes_count: summary.changesCount,
        stale_models_deleted: summary.staleModelsDeleted,
        summary: {
            reportPath: summary.reportPath,
            changeFeedPath: summary.changeFeedPath,
            changeFeedNewEntries: summary.changeFeedNewEntries,
        },
        error: errorMessage ?? null,
    };
    const { error } = await client.from("model_discovery_runs").update(payload).eq("id", runId);

    if (error) {
        throw new Error(error.message || "Failed to update model_discovery_runs finish row");
    }
}

async function loadSeenModelIdsByProvider(providerIds: string[]): Promise<Map<string, Set<string>>> {
    const out = new Map<string, Set<string>>();
    for (const providerId of providerIds) {
        out.set(providerId, new Set<string>());
    }

    if (providerIds.length === 0) {
        return out;
    }

    const client = createAdminClient();
    const pageSize = 1000;
    let from = 0;

    while (true) {
        const { data, error } = await client
            .from("model_discovery_seen_models")
            .select("provider_id, model_id")
            .in("provider_id", providerIds)
            .range(from, from + pageSize - 1);

        if (error) {
            throw new Error(error.message || "Failed to load model_discovery_seen_models");
        }

        const rows = (data ?? []) as Array<{ provider_id: string | null; model_id: string | null }>;
        if (rows.length === 0) {
            break;
        }

        for (const row of rows) {
            if (!row.provider_id || !row.model_id) continue;
            const bucket = out.get(row.provider_id);
            if (!bucket) continue;
            bucket.add(row.model_id);
        }

        if (rows.length < pageSize) {
            break;
        }

        from += pageSize;
    }

    return out;
}

async function upsertSeenModels(rows: SeenModelUpsertRow[]): Promise<void> {
    if (rows.length === 0) return;

    const client = createAdminClient();
    for (let index = 0; index < rows.length; index += UPSERT_BATCH_SIZE) {
        const batch = rows.slice(index, index + UPSERT_BATCH_SIZE);
        const { error } = await client
            .from("model_discovery_seen_models")
            .upsert(batch, { onConflict: "provider_id,model_id" });
        if (error) {
            throw new Error(error.message || "Failed to upsert model_discovery_seen_models");
        }
    }
}

async function deleteSeenModels(rows: SeenModelDeleteRow[]): Promise<number> {
    if (rows.length === 0) return 0;

    const client = createAdminClient();
    const grouped = new Map<string, string[]>();

    for (const row of rows) {
        const values = grouped.get(row.provider_id) ?? [];
        values.push(row.model_id);
        grouped.set(row.provider_id, values);
    }

    let deletedCount = 0;
    for (const [providerId, modelIds] of grouped.entries()) {
        for (let index = 0; index < modelIds.length; index += UPSERT_BATCH_SIZE) {
            const batch = modelIds.slice(index, index + UPSERT_BATCH_SIZE);
            const { data, error } = await client
                .from("model_discovery_seen_models")
                .delete()
                .eq("provider_id", providerId)
                .in("model_id", batch)
                .select("model_id");
            if (error) {
                throw new Error(error.message || "Failed to delete from model_discovery_seen_models");
            }
            deletedCount += Array.isArray(data) ? data.length : 0;
        }
    }

    return deletedCount;
}

async function loadProviders(): Promise<ProviderDefinition[]> {
    const files = fs
        .readdirSync(PROVIDERS_DIR, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter(
            (name) =>
                name.endsWith(".ts") &&
                !name.startsWith("_") &&
                name !== "discovery-policy.ts"
        )
        .sort();

    const providers: ProviderDefinition[] = [];
    const providerIds = new Set<string>();

    const appendProvider = (provider: ProviderDefinition): void => {
        if (providerIds.has(provider.id)) return;
        providerIds.add(provider.id);
        providers.push(provider);
    };

    for (const file of files) {
        const moduleUrl = pathToFileURL(path.join(PROVIDERS_DIR, file)).href;
        const imported = (await import(moduleUrl)) as { default?: unknown };
        const exported = unwrapDefaultExport(imported.default);

        if (!exported) {
            throw new Error(`Invalid provider module: ${file}`);
        }

        if (isProviderDefinition(exported)) {
            appendProvider(exported);
            continue;
        }

        if (!Array.isArray(exported) || !exported.every(isProviderDefinition)) {
            throw new Error(`Invalid provider module: ${file}`);
        }

        for (const provider of exported) {
            appendProvider(provider);
        }
    }

    return providers;
}

function limitList(values: string[], maxItems = 8): string {
    if (values.length === 0) return "none";
    if (values.length <= maxItems) return values.join(", ");
    const remaining = values.length - maxItems;
    return `${values.slice(0, maxItems).join(", ")}, +${remaining} more`;
}

function readChangeFeed(filePath: string): ProviderChangeEntry[] {
    if (!fs.existsSync(filePath)) {
        return [];
    }

    try {
        const content = fs.readFileSync(filePath, "utf-8");
        return content
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map((line) => JSON.parse(line) as ProviderChangeEntry);
    } catch {
        return [];
    }
}

function writeChangeFeed(filePath: string, entries: ProviderChangeEntry[]): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const lines = entries.map((entry) => JSON.stringify(entry));
    fs.writeFileSync(filePath, lines.length > 0 ? `${lines.join("\n")}\n` : "", "utf-8");
}

function buildProviderChangeEntries(changes: ProviderChangeSet[], timestamp: string): ProviderChangeEntry[] {
    const out: ProviderChangeEntry[] = [];

    for (const change of changes) {
        const append = (action: ProviderChangeEntry["action"], modelIds: string[]) => {
            for (const modelId of modelIds) {
                out.push({
                    id: `${timestamp}:${change.providerId}:${action}:${modelId}`,
                    ts: timestamp,
                    action,
                    platformId: change.platformId,
                    platformName: change.platformName,
                    providerId: change.providerId,
                    providerName: change.providerName,
                    modelId,
                });
            }
        };

        append("create", change.added);
        append("delete", change.removed);
        append("update", change.changed);
    }

    return out;
}

function buildDiscordMessage(changes: ProviderChangeSet[], entries: ProviderChangeEntry[]): string {
    const cloudCount = new Set(changes.map((change) => change.platformId)).size;
    const header =
        `Upstream model catalog changes detected: ${entries.length} event${entries.length === 1 ? "" : "s"} ` +
        `across ${changes.length} provider${changes.length === 1 ? "" : "s"} and ${cloudCount} cloud platform${cloudCount === 1 ? "" : "s"}.`;
    const lines = [header, ""];

    if (entries.length > 0) {
        lines.push("Recent events:");
        const visibleEntries = entries.slice(0, MAX_DISCORD_EVENT_LINES);
        for (const entry of visibleEntries) {
            const actionSymbol = entry.action === "create" ? "+" : entry.action === "delete" ? "-" : "~";
            lines.push(
                `  ${actionSymbol} [${entry.platformName}] ${entry.providerName} (${entry.providerId}) :: ${entry.modelId}`
            );
        }
        if (entries.length > visibleEntries.length) {
            lines.push(`  ...and ${entries.length - visibleEntries.length} more event(s)`);
        }
        lines.push("");
    }

    lines.push("Provider summary:");

    for (const change of changes) {
        lines.push(
            `- [${change.platformName}] ${change.providerName} (${change.providerId}): +${change.added.length} / -${change.removed.length} / ~${change.changed.length} (${change.previousCount} -> ${change.currentCount})`
        );
        if (change.added.length > 0) lines.push(`  Added: ${limitList(change.added)}`);
        if (change.removed.length > 0) lines.push(`  Removed: ${limitList(change.removed)}`);
        if (change.changed.length > 0) lines.push(`  Changed: ${limitList(change.changed)}`);
        lines.push("");
    }

    const message = lines.join("\n").trim();
    return message.length <= 1900 ? message : `${message.slice(0, 1890)}\n...[truncated]`;
}

async function sendDiscordWebhook(message: string): Promise<void> {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL?.trim() || "";
    if (!webhookUrl) return;

    try {
        new URL(webhookUrl);
    } catch {
        console.warn(
            "[model-discovery] Skipping Discord webhook: DISCORD_WEBHOOK_URL is not a valid URL."
        );
        return;
    }

    const userId = process.env.DISCORD_USER_ID;
    const roleId = process.env.DISCORD_ROLE_ID;
    const mentions: string[] = [];
    if (roleId) mentions.push(`<@&${roleId}>`);
    if (userId) mentions.push(`<@${userId}>`);
    const content = mentions.length > 0 ? `${mentions.join(" ")}\n${message}` : message;
    const payload: Record<string, unknown> = { content };

    if (userId || roleId) {
        payload.allowed_mentions = {
            parse: [],
            users: userId ? [userId] : [],
            roles: roleId ? [roleId] : [],
        };
    }

    const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Discord webhook failed with HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
    }
}

async function main(): Promise<void> {
    const loadedEnvFiles = loadLocalEnvFiles();
    const apiModelAllowlistByProvider = await loadApiModelAllowlistByProvider();

    const previousState = readState(STATE_PATH);
    const nextState: DiscoveryState = {
        version: 1,
        generatedAt: nowIso(),
        providers: { ...previousState.providers },
    };

    const providers = await loadProviders();
    const runId = crypto.randomUUID();
    const runStartedAtIso = nowIso();
    const providerReadiness = providers.map((provider) => {
        const discoveryRule = getProviderDiscoveryRule(provider.id);
        const isInactiveByPolicy = !discoveryRule || !discoveryRule.active;
        const missingEnv = getMissingEnvVars(provider.requiredEnv);
        return {
            providerId: provider.id,
            providerName: provider.name,
            platformId: discoveryRule?.platformId ?? provider.id,
            platformName: discoveryRule?.platformName ?? provider.name,
            isInactiveByPolicy,
            inactiveReason:
                discoveryRule?.reason ??
                "No discovery policy mapping for this provider id.",
            missingEnv,
            isReady: !isInactiveByPolicy && missingEnv.length === 0,
        };
    });
    const readyCount = providerReadiness.filter((provider) => provider.isReady).length;
    const inactiveProviders = providerReadiness.filter((provider) => provider.isInactiveByPolicy);
    const missingEnvProviders = providerReadiness.filter((provider) => !provider.isInactiveByPolicy && !provider.isReady);
    const missingKeyTotals = new Map<string, number>();
    for (const provider of missingEnvProviders) {
        for (const envVar of provider.missingEnv) {
            missingKeyTotals.set(envVar, (missingKeyTotals.get(envVar) ?? 0) + 1);
        }
    }
    const missingKeys = Array.from(missingKeyTotals.keys()).sort((a, b) => a.localeCompare(b));
    const results: ProviderRunResult[] = [];
    const changes: ProviderChangeSet[] = [];
    const upsertRows: SeenModelUpsertRow[] = [];
    const deleteRows: SeenModelDeleteRow[] = [];
    let staleModelsDeleted = 0;
    let runChangeEntries: ProviderChangeEntry[] = [];
    let mergedFeed: ProviderChangeEntry[] = [];
    let notificationError: string | null = null;
    let finishedAtIso = runStartedAtIso;
    const readinessById = new Map<string, string[]>(providerReadiness.map((provider) => [provider.providerId, provider.missingEnv]));
    const platformInfoByProviderId = new Map(
        providerReadiness.map((provider) => [
            provider.providerId,
            {
                platformId: provider.platformId,
                platformName: provider.platformName,
            },
        ])
    );
    const inactiveById = new Map<string, string | undefined>(
        providerReadiness
            .filter((provider) => provider.isInactiveByPolicy)
            .map((provider) => [provider.providerId, provider.inactiveReason])
    );
    const seenModelIdsByProvider = await loadSeenModelIdsByProvider(providers.map((provider) => provider.id));
    await insertRunStart(runId, runStartedAtIso, providers.length);

    try {
        for (const provider of providers) {
            if (inactiveById.has(provider.id)) {
                const inactiveReason = inactiveById.get(provider.id);
                results.push({
                    providerId: provider.id,
                    providerName: provider.name,
                    status: "skipped",
                    reason: `Inactive by policy: ${inactiveReason || "Provider disabled until a stable models endpoint is available."}`,
                });
                continue;
            }

            const missingEnv = readinessById.get(provider.id) ?? getMissingEnvVars(provider.requiredEnv);
            if (missingEnv.length > 0) {
                results.push({
                    providerId: provider.id,
                    providerName: provider.name,
                    status: "skipped",
                    reason: `Missing env vars: ${missingEnv.join(", ")}`,
                });
                continue;
            }

            const started = Date.now();
            try {
                const models = await provider.fetchModels();
                const fetchedAt = nowIso();
                const currentSnapshot: ProviderSnapshot = {
                    providerId: provider.id,
                    providerName: provider.name,
                    fetchedAt,
                    modelCount: models.length,
                    models: normalizeProviderModels(models),
                };

                const previousSnapshot = previousState.providers[provider.id];
                const rawDiff = diffSnapshots(previousSnapshot, currentSnapshot);
                const allowlist = provider.id === "anthropic" ? undefined : apiModelAllowlistByProvider.get(provider.id);
                const filteredDiff = filterDiffByAllowlist(rawDiff, allowlist);
                if (filteredDiff) {
                    const platformInfo = platformInfoByProviderId.get(provider.id) ?? {
                        platformId: provider.id,
                        platformName: provider.name,
                    };
                    changes.push({
                        ...filteredDiff,
                        platformId: platformInfo.platformId,
                        platformName: platformInfo.platformName,
                    });
                }

                const currentModelIds = new Set(models.map((model) => model.id));
                const previousSeenIds = seenModelIdsByProvider.get(provider.id) ?? new Set<string>();
                for (const model of models) {
                    const modelDetails = asRecord(model.payload) ?? { value: model.payload };
                    upsertRows.push({
                        provider_id: provider.id,
                        provider_name: provider.name,
                        model_id: model.id,
                        model_details: sortKeysDeep(modelDetails) as Record<string, unknown>,
                        pricing_details: extractPricingDetails(modelDetails),
                        last_seen_at: fetchedAt,
                        last_run_id: runId,
                    });
                }
                for (const previousId of previousSeenIds) {
                    if (!currentModelIds.has(previousId)) {
                        deleteRows.push({
                            provider_id: provider.id,
                            model_id: previousId,
                        });
                    }
                }
                seenModelIdsByProvider.set(provider.id, currentModelIds);

                nextState.providers[provider.id] = currentSnapshot;

                results.push({
                    providerId: provider.id,
                    providerName: provider.name,
                    status: "success",
                    durationMs: Date.now() - started,
                    modelCount: models.length,
                    diff: filteredDiff,
                });
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                results.push({
                    providerId: provider.id,
                    providerName: provider.name,
                    status: "error",
                    durationMs: Date.now() - started,
                    reason,
                });
            }
        }

        writeJson(STATE_PATH, nextState);
        await upsertSeenModels(upsertRows);
        staleModelsDeleted = await deleteSeenModels(deleteRows);

        const runTimestamp = nowIso();
        runChangeEntries = buildProviderChangeEntries(changes, runTimestamp);
        const existingFeed = readChangeFeed(CHANGE_FEED_PATH);
        const seenFeedIds = new Set<string>();
        mergedFeed = [];
        for (const entry of [...runChangeEntries, ...existingFeed]) {
            if (seenFeedIds.has(entry.id)) continue;
            seenFeedIds.add(entry.id);
            mergedFeed.push(entry);
            if (mergedFeed.length >= MAX_CHANGE_FEED_ENTRIES) break;
        }
        writeChangeFeed(CHANGE_FEED_PATH, mergedFeed);

        const report = {
            generatedAt: nowIso(),
            runId,
            statePath: path.relative(process.cwd(), STATE_PATH),
            changeFeedPath: path.relative(process.cwd(), CHANGE_FEED_PATH),
            changeFeedTotalEntries: mergedFeed.length,
            changeFeedNewEntries: runChangeEntries.length,
            providerCount: providers.length,
            staleModelsDeleted,
            results,
            changes,
        };
        writeJson(REPORT_PATH, report);

        console.log(`[model-discovery] Provider env readiness: ${readyCount}/${providers.length} ready`);
        if (inactiveProviders.length > 0) {
            const inactiveSummary = inactiveProviders
                .slice(0, 12)
                .map((provider) => `${provider.providerId}${provider.inactiveReason ? ` (${provider.inactiveReason})` : ""}`)
                .join(", ");
            console.log(`[model-discovery] Inactive providers by policy (${inactiveProviders.length}): ${inactiveSummary}`);
            if (inactiveProviders.length > 12) {
                console.log(`[model-discovery] ...and ${inactiveProviders.length - 12} more inactive providers`);
            }
        }
        if (missingEnvProviders.length > 0) {
            const missingEnvSummary = missingEnvProviders
                .slice(0, 12)
                .map((provider) => `${provider.providerId} (${provider.missingEnv.join(", ")})`)
                .join(", ");
            console.log(
                `[model-discovery] Missing env vars for ${missingEnvProviders.length} provider(s): ${missingEnvSummary}`
            );
            if (missingEnvProviders.length > 12) {
                console.log(`[model-discovery] ...and ${missingEnvProviders.length - 12} more`);
            }
            console.log(`[model-discovery] Missing env keys (${missingKeys.length}): ${missingKeys.join(", ")}`);
        }

        console.log(`[model-discovery] Providers loaded: ${providers.length}`);
        console.log(
            `[model-discovery] API model allowlist loaded from data_api_provider_models for ${apiModelAllowlistByProvider.size} provider(s).`
        );
        if (loadedEnvFiles.length > 0) {
            console.log(`[model-discovery] Loaded local env files: ${loadedEnvFiles.join(", ")}`);
        }
        for (const result of results) {
            if (result.status === "success") {
                const suffix = result.diff ? `, changes: +${result.diff.added.length}/-${result.diff.removed.length}/~${result.diff.changed.length}` : "";
                console.log(
                    `[model-discovery] ${result.providerId}: fetched ${result.modelCount} model(s) in ${result.durationMs}ms${suffix}`
                );
            } else if (result.status === "skipped") {
                console.log(`[model-discovery] ${result.providerId}: skipped (${result.reason})`);
            } else {
                console.log(`[model-discovery] ${result.providerId}: error after ${result.durationMs}ms (${result.reason})`);
            }
        }

        if (changes.length === 0) {
            console.log("[model-discovery] No model changes detected.");
        } else {
            const message = buildDiscordMessage(changes, runChangeEntries);
            console.log(`[model-discovery] Changes detected in ${changes.length} provider(s). Sending Discord notification.`);
            try {
                await sendDiscordWebhook(message);
            } catch (error) {
                notificationError = error instanceof Error ? error.message : String(error);
                console.error(`[model-discovery] Discord notification failed: ${notificationError}`);
            }
        }

        finishedAtIso = nowIso();
        const providersError = results.filter((result) => result.status === "error").length;
        const changesCount = runChangeEntries.length;
        const status: RunStatus = providersError > 0 || notificationError ? "completed_with_errors" : "completed";
        await updateRunFinish(
            runId,
            status,
            {
                startedAtIso: runStartedAtIso,
                finishedAtIso,
                providersTotal: providers.length,
                providersSuccess: results.filter((result) => result.status === "success").length,
                providersSkipped: results.filter((result) => result.status === "skipped").length,
                providersError,
                changesCount,
                staleModelsDeleted,
                reportPath: path.relative(process.cwd(), REPORT_PATH),
                changeFeedPath: path.relative(process.cwd(), CHANGE_FEED_PATH),
                changeFeedNewEntries: runChangeEntries.length,
            },
            notificationError ?? undefined
        );

        if (notificationError) {
            throw new Error(`Discord notification failed: ${notificationError}`);
        }
    } catch (error) {
        finishedAtIso = nowIso();
        const message = error instanceof Error ? error.message : String(error);
        try {
            await updateRunFinish(
                runId,
                "failed",
                {
                    startedAtIso: runStartedAtIso,
                    finishedAtIso,
                    providersTotal: providers.length,
                    providersSuccess: results.filter((result) => result.status === "success").length,
                    providersSkipped: results.filter((result) => result.status === "skipped").length,
                    providersError: results.filter((result) => result.status === "error").length,
                    changesCount: runChangeEntries.length,
                    staleModelsDeleted,
                    reportPath: path.relative(process.cwd(), REPORT_PATH),
                    changeFeedPath: path.relative(process.cwd(), CHANGE_FEED_PATH),
                    changeFeedNewEntries: runChangeEntries.length,
                },
                message
            );
        } catch (updateError) {
            const updateMessage = updateError instanceof Error ? updateError.message : String(updateError);
            console.error(`[model-discovery] Failed to mark run as failed: ${updateMessage}`);
        }
        throw error;
    }
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[model-discovery] Fatal error: ${message}`);
    process.exitCode = 1;
});
