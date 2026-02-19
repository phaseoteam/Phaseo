import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createAdminClient } from "../../apps/web/src/utils/supabase/admin";
import type { ProviderDefinition, ProviderModel } from "./providers/_shared";
import { getMissingEnvVars, sortKeysDeep } from "./providers/_shared";

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

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROVIDERS_DIR = path.join(SCRIPT_DIR, "providers");
const STATE_DIR = path.join(SCRIPT_DIR, "state");
const STATE_PATH = path.join(STATE_DIR, "provider-model-snapshots.json");
const REPORT_PATH = path.join(STATE_DIR, "last-run-report.json");

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
        path.join(root, "dev.vars"),
        path.join(root, ".env.locals"),
        path.join(root, ".env.local"),
        path.join(root, "scripts", "model-discovery", "dev.env"),
        path.join(root, "scripts", "model-discovery", ".env"),
        path.join(root, "apps", "api", "dev.vars"),
        path.join(root, "apps", "api", ".env.locals"),
        path.join(root, "apps", "api", ".env.local"),
        path.join(root, "apps", "api", ".env"),
        path.join(root, "apps", "web", "dev.vars"),
        path.join(root, "apps", "web", ".env.locals"),
        path.join(root, "apps", "web", ".env.local"),
        path.join(root, "apps", "web", ".env"),
        path.join(SCRIPT_DIR, "dev.vars"),
        path.join(SCRIPT_DIR, "dev.env"),
        path.join(SCRIPT_DIR, ".env.locals"),
        path.join(SCRIPT_DIR, ".env.local"),
        path.join(SCRIPT_DIR, ".env"),
    ];

    const loaded: string[] = [];

    for (const filePath of candidates) {
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
        if (!jsonEqual(previousModels[id], currentModels[id])) {
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
    if (!diff || !allowlist || allowlist.size === 0) {
        return null;
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

async function loadProviders(): Promise<ProviderDefinition[]> {
    const files = fs
        .readdirSync(PROVIDERS_DIR, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((name) => name.endsWith(".ts") && !name.startsWith("_"))
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
        const exported = imported.default;

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

function buildDiscordMessage(changes: ProviderDiff[]): string {
    const header = `Model catalog changes detected across ${changes.length} provider${changes.length === 1 ? "" : "s"}.`;
    const lines = [header, ""];

    for (const change of changes) {
        lines.push(
            `${change.providerName} (${change.providerId}): +${change.added.length} / -${change.removed.length} / ~${change.changed.length} (${change.previousCount} -> ${change.currentCount})`
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
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) return;

    const userId = process.env.DISCORD_USER_ID;
    const content = userId ? `<@${userId}>\n${message}` : message;
    const payload: Record<string, unknown> = { content };

    if (userId) {
        payload.allowed_mentions = { users: [userId] };
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
    const providerReadiness = providers.map((provider) => {
        const missingEnv = getMissingEnvVars(provider.requiredEnv);
        return {
            providerId: provider.id,
            providerName: provider.name,
            missingEnv,
            isReady: missingEnv.length === 0,
        };
    });
    const readyCount = providerReadiness.filter((provider) => provider.isReady).length;
    const missingEnvProviders = providerReadiness.filter((provider) => !provider.isReady);
    const missingKeyTotals = new Map<string, number>();
    for (const provider of missingEnvProviders) {
        for (const envVar of provider.missingEnv) {
            missingKeyTotals.set(envVar, (missingKeyTotals.get(envVar) ?? 0) + 1);
        }
    }
    const missingKeys = Array.from(missingKeyTotals.keys()).sort((a, b) => a.localeCompare(b));
    const results: ProviderRunResult[] = [];
    const changes: ProviderDiff[] = [];
    const readinessById = new Map<string, string[]>(providerReadiness.map((provider) => [provider.providerId, provider.missingEnv]));

    for (const provider of providers) {
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
            const currentSnapshot: ProviderSnapshot = {
                providerId: provider.id,
                providerName: provider.name,
                fetchedAt: nowIso(),
                modelCount: models.length,
                models: normalizeProviderModels(models),
            };

            const previousSnapshot = previousState.providers[provider.id];
            const rawDiff = diffSnapshots(previousSnapshot, currentSnapshot);
            const filteredDiff = filterDiffByAllowlist(rawDiff, apiModelAllowlistByProvider.get(provider.id));
            if (filteredDiff) changes.push(filteredDiff);

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

    const report = {
        generatedAt: nowIso(),
        statePath: path.relative(process.cwd(), STATE_PATH),
        providerCount: providers.length,
        results,
        changes,
    };
    writeJson(REPORT_PATH, report);

    console.log(`[model-discovery] Provider env readiness: ${readyCount}/${providers.length} ready`);
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
        return;
    }

    const message = buildDiscordMessage(changes);
    console.log(`[model-discovery] Changes detected in ${changes.length} provider(s). Sending Discord notification.`);
    await sendDiscordWebhook(message);
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[model-discovery] Fatal error: ${message}`);
    process.exitCode = 1;
});
