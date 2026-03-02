import fs from "node:fs";
import path from "node:path";

type CliOptions = {
    webhookUrl: string | null;
    discordUserId: string | null;
    discordRoleId: string | null;
    hfOrgs: string[];
    hfToken: string | null;
};

type ModelFileSnapshot = {
    filePath: string;
    modelId: string | null;
    modelName: string | null;
};

type HuggingFaceOrgSnapshot = {
    fetchedAt: string;
    modelIds: string[];
};

type InternalModelsFileState = {
    version: 2;
    generatedAt: string;
    files: Record<string, ModelFileSnapshot>;
    hfOrgs: Record<string, HuggingFaceOrgSnapshot>;
};

type ModelFileDiff = {
    added: string[];
    removed: string[];
    changed: string[];
    previousCount: number;
    currentCount: number;
};

type HuggingFaceOrgAdditions = {
    org: string;
    addedModelIds: string[];
};

function nowIso(): string {
    return new Date().toISOString();
}

function parseArgs(argv: string[]): CliOptions {
    let webhookUrl: string | null = null;
    let discordUserId: string | null = null;
    let discordRoleId: string | null = null;
    let hfToken: string | null = null;
    const hfOrgs: string[] = [];

    for (let index = 0; index < argv.length; index += 1) {
        const key = argv[index];
        const value = argv[index + 1];
        if (!key?.startsWith("--")) continue;
        if (value === undefined || value.startsWith("--")) continue;

        if (key === "--webhook-url") {
            webhookUrl = value.trim() || null;
            index += 1;
            continue;
        }

        if (key === "--discord-user-id") {
            discordUserId = value.trim() || null;
            index += 1;
            continue;
        }

        if (key === "--discord-role-id") {
            discordRoleId = value.trim() || null;
            index += 1;
            continue;
        }

        if (key === "--hf-orgs") {
            for (const item of value.split(/[,\s]+/)) {
                const org = item.trim().toLowerCase();
                if (!org) continue;
                if (!hfOrgs.includes(org)) hfOrgs.push(org);
            }
            index += 1;
            continue;
        }

        if (key === "--hf-token") {
            hfToken = value.trim() || null;
            index += 1;
        }
    }

    return { webhookUrl, discordUserId, discordRoleId, hfOrgs, hfToken };
}

function collectModelJsonFiles(rootDir: string): string[] {
    if (!fs.existsSync(rootDir)) return [];

    const out: string[] = [];

    const visit = (currentDir: string): void => {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const absolutePath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                visit(absolutePath);
                continue;
            }
            if (!entry.isFile()) continue;
            if (entry.name !== "model.json") continue;
            out.push(absolutePath);
        }
    };

    visit(rootDir);
    return out.sort((left, right) => left.localeCompare(right));
}

function readModelFileSnapshot(filePath: string, repoRoot: string): ModelFileSnapshot | null {
    try {
        const raw = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw) as Record<string, unknown>;

        const modelId =
            typeof parsed.model_id === "string" && parsed.model_id.trim()
                ? parsed.model_id.trim()
                : null;
        const modelName =
            typeof parsed.name === "string" && parsed.name.trim()
                ? parsed.name.trim()
                : null;

        return {
            filePath: path.relative(repoRoot, filePath),
            modelId,
            modelName,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[internal-model-check] Failed to read ${path.relative(repoRoot, filePath)}: ${message}`);
        return null;
    }
}

function emptyState(): InternalModelsFileState {
    return {
        version: 2,
        generatedAt: nowIso(),
        files: {},
        hfOrgs: {},
    };
}

function readState(filePath: string): { state: InternalModelsFileState; hasHfState: boolean } {
    if (!fs.existsSync(filePath)) {
        return { state: emptyState(), hasHfState: false };
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as
            | (Partial<InternalModelsFileState> & { version?: number; hfOrgs?: unknown })
            | undefined;

        if (!parsed?.files || typeof parsed.files !== "object") {
            return { state: emptyState(), hasHfState: false };
        }

        if (parsed.version === 2) {
            const hasHfState = parsed.hfOrgs !== undefined && typeof parsed.hfOrgs === "object";
            return {
                state: {
                    version: 2,
                    generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : nowIso(),
                    files: parsed.files as Record<string, ModelFileSnapshot>,
                    hfOrgs: hasHfState ? (parsed.hfOrgs as Record<string, HuggingFaceOrgSnapshot>) : {},
                },
                hasHfState,
            };
        }

        // Backward compatibility with v1 state (no hfOrgs key).
        return {
            state: {
                version: 2,
                generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : nowIso(),
                files: parsed.files as Record<string, ModelFileSnapshot>,
                hfOrgs: {},
            },
            hasHfState: false,
        };
    } catch {
        return { state: emptyState(), hasHfState: false };
    }
}

function writeJson(filePath: string, value: unknown): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function buildCurrentFileMap(repoRoot: string): Record<string, ModelFileSnapshot> {
    const modelsRoot = path.join(repoRoot, "apps", "web", "src", "data", "models");
    const files = collectModelJsonFiles(modelsRoot);
    const map = new Map<string, ModelFileSnapshot>();

    for (const absoluteFilePath of files) {
        const snapshot = readModelFileSnapshot(absoluteFilePath, repoRoot);
        if (!snapshot) continue;
        map.set(snapshot.filePath, snapshot);
    }

    return Object.fromEntries(Array.from(map.entries()).sort(([left], [right]) => left.localeCompare(right)));
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

async function fetchHfOrgModelIds(org: string, hfToken: string | null): Promise<string[]> {
    const headers: Record<string, string> = {};
    if (hfToken) {
        headers.Authorization = `Bearer ${hfToken}`;
    }

    const discovered = new Set<string>();
    let nextUrl = `https://huggingface.co/api/models?author=${encodeURIComponent(org)}&limit=100&full=false&config=false&cardData=false`;
    let pageCount = 0;
    const maxPages = 50;

    while (nextUrl && pageCount < maxPages) {
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
        console.warn(`[internal-model-check] HF org '${org}' reached pagination cap (${maxPages} pages).`);
    }

    return Array.from(discovered).sort((left, right) => left.localeCompare(right));
}

async function buildCurrentHfOrgMap(
    hfOrgs: string[],
    hfToken: string | null,
    previousHfOrgs: Record<string, HuggingFaceOrgSnapshot>
): Promise<{ snapshots: Record<string, HuggingFaceOrgSnapshot>; fetchedOrgs: Set<string> }> {
    const snapshots: Record<string, HuggingFaceOrgSnapshot> = {};
    const fetchedOrgs = new Set<string>();

    for (const org of hfOrgs) {
        try {
            const modelIds = await fetchHfOrgModelIds(org, hfToken);
            snapshots[org] = {
                fetchedAt: nowIso(),
                modelIds,
            };
            fetchedOrgs.add(org);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[internal-model-check] HF org '${org}' fetch failed: ${message}`);
            if (previousHfOrgs[org]) {
                snapshots[org] = previousHfOrgs[org];
            }
        }
    }

    return { snapshots, fetchedOrgs };
}

function jsonEqual(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

function diffStates(previous: InternalModelsFileState, currentFiles: Record<string, ModelFileSnapshot>): ModelFileDiff {
    const previousPaths = new Set(Object.keys(previous.files));
    const currentPaths = new Set(Object.keys(currentFiles));

    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];

    for (const filePath of Array.from(currentPaths).sort()) {
        if (!previousPaths.has(filePath)) {
            added.push(filePath);
            continue;
        }
        if (!jsonEqual(previous.files[filePath], currentFiles[filePath])) {
            changed.push(filePath);
        }
    }

    for (const filePath of Array.from(previousPaths).sort()) {
        if (!currentPaths.has(filePath)) {
            removed.push(filePath);
        }
    }

    return {
        added,
        removed,
        changed,
        previousCount: previousPaths.size,
        currentCount: currentPaths.size,
    };
}

function diffHfOrgAdditions(
    previousHfOrgs: Record<string, HuggingFaceOrgSnapshot>,
    currentHfOrgs: Record<string, HuggingFaceOrgSnapshot>,
    fetchedOrgs: Set<string>,
    configuredHfOrgs: string[]
): HuggingFaceOrgAdditions[] {
    const out: HuggingFaceOrgAdditions[] = [];

    for (const org of configuredHfOrgs) {
        if (!fetchedOrgs.has(org)) continue;
        const previousIds = new Set(previousHfOrgs[org]?.modelIds ?? []);
        const currentIds = currentHfOrgs[org]?.modelIds ?? [];
        const addedModelIds = currentIds.filter((modelId) => !previousIds.has(modelId));
        if (addedModelIds.length === 0) continue;
        out.push({ org, addedModelIds });
    }

    return out.sort((left, right) => left.org.localeCompare(right.org));
}

function countHfAdditions(items: HuggingFaceOrgAdditions[]): number {
    return items.reduce((total, item) => total + item.addedModelIds.length, 0);
}

function displayModelName(snapshot: ModelFileSnapshot): string {
    if (snapshot.modelName) return snapshot.modelName;
    if (snapshot.modelId) return snapshot.modelId;

    const parts = snapshot.filePath.split(/[\\/]/g);
    return parts.length >= 2 ? parts[parts.length - 2] : snapshot.filePath;
}

const MODEL_DETAILS_BASE_URL = "https://ai-stats.phaseo.app";
const HUGGING_FACE_BASE_URL = "https://huggingface.co";

function appendBoundedLines(lines: string[], values: string[], maxItems = 40): void {
    const visible = values.slice(0, maxItems);
    for (const value of visible) lines.push(value);
    if (values.length > maxItems) lines.push(`- ...and ${values.length - maxItems} more`);
}

function buildInternalModelLink(snapshot: ModelFileSnapshot): string | null {
    const parts = snapshot.filePath.split(/[\\/]+/g);
    const modelsIndex = parts.indexOf("models");
    if (modelsIndex === -1 || modelsIndex + 2 >= parts.length) return null;
    const organisationId = parts[modelsIndex + 1];
    const modelSlug = parts[modelsIndex + 2];
    if (!organisationId || !modelSlug) return null;
    return `${MODEL_DETAILS_BASE_URL}/models/${encodeURIComponent(organisationId)}/${encodeURIComponent(modelSlug)}`;
}

function buildInternalModelLine(prefix: "New Model" | "Removed Model", snapshot: ModelFileSnapshot): string {
    const name = displayModelName(snapshot);
    const link = buildInternalModelLink(snapshot);
    if (!link) return `- ${prefix}: ${name}`;
    return `- ${prefix}: ${name} <${link}>`;
}

function buildHfModelLine(modelId: string): string {
    const normalized = modelId.trim();
    if (!normalized) return "- Unknown HF model";
    return `- ${normalized} <${HUGGING_FACE_BASE_URL}/${normalized}>`;
}

function buildDiscordMessage(
    addedPaths: string[],
    removedPaths: string[],
    hfAdditionsByOrg: HuggingFaceOrgAdditions[],
    currentFilesByPath: Record<string, ModelFileSnapshot>,
    previousFilesByPath: Record<string, ModelFileSnapshot>
): string {
    const hfAdditionsTotal = countHfAdditions(hfAdditionsByOrg);
    const lines = [
        `Detected ${addedPaths.length} new, ${removedPaths.length} removed internal model${addedPaths.length + removedPaths.length === 1 ? "" : "s"} and ${hfAdditionsTotal} new Hugging Face model${hfAdditionsTotal === 1 ? "" : "s"}.`,
        "",
    ];

    if (addedPaths.length > 0) {
        lines.push(`Internal Model Additions (${addedPaths.length}):`);
    }
    for (const filePath of addedPaths) {
        const snapshot = currentFilesByPath[filePath];
        if (!snapshot) continue;
        lines.push(buildInternalModelLine("New Model", snapshot));
    }

    if (addedPaths.length > 0 && removedPaths.length > 0) {
        lines.push("");
    }

    if (removedPaths.length > 0) {
        lines.push(`Internal Model Removals (${removedPaths.length}):`);
    }

    for (const filePath of removedPaths) {
        const snapshot = previousFilesByPath[filePath];
        if (!snapshot) continue;
        lines.push(buildInternalModelLine("Removed Model", snapshot));
    }

    if (hfAdditionsByOrg.length > 0) {
        if (addedPaths.length > 0 || removedPaths.length > 0) {
            lines.push("");
        }
        for (const orgEntry of hfAdditionsByOrg) {
            lines.push(`Hugging Face (${orgEntry.org}) Additions (${orgEntry.addedModelIds.length}):`);
            appendBoundedLines(lines, orgEntry.addedModelIds.map(buildHfModelLine));
            lines.push("");
        }
    }

    const message = lines.join("\n").trim();
    return message.length <= 1900 ? message : `${message.slice(0, 1890)}\n...[truncated]`;
}

async function sendDiscordWebhook(message: string, options: { webhookUrl: string; discordUserId: string | null; discordRoleId: string | null }): Promise<void> {
    let parsed: URL;
    try {
        parsed = new URL(options.webhookUrl);
    } catch {
        console.warn("[internal-model-check] Skipping Discord webhook: provided webhook URL is invalid.");
        return;
    }

    if (parsed.protocol !== "https:") {
        console.warn("[internal-model-check] Skipping Discord webhook: webhook URL must use https.");
        return;
    }

    const mentions: string[] = [];
    if (options.discordRoleId) mentions.push(`<@&${options.discordRoleId}>`);
    if (options.discordUserId) mentions.push(`<@${options.discordUserId}>`);
    const content = mentions.length > 0 ? `${mentions.join(" ")}\n${message}` : message;
    const payload: Record<string, unknown> = { content };
    if (options.discordUserId || options.discordRoleId) {
        payload.allowed_mentions = {
            parse: [],
            users: options.discordUserId ? [options.discordUserId] : [],
            roles: options.discordRoleId ? [options.discordRoleId] : [],
        };
    }

    const response = await fetch(options.webhookUrl, {
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
    const options = parseArgs(process.argv.slice(2));
    const repoRoot = process.cwd();
    const stateDir = path.join(repoRoot, "scripts", "model-discovery", "state");
    const statePath = path.join(stateDir, "internal-model-files-state.json");
    const reportPath = path.join(stateDir, "last-internal-model-files-report.json");

    const previous = readState(statePath);
    const previousState = previous.state;
    const currentFiles = buildCurrentFileMap(repoRoot);
    const currentHf = await buildCurrentHfOrgMap(options.hfOrgs, options.hfToken, previousState.hfOrgs);

    const nextState: InternalModelsFileState = {
        version: 2,
        generatedAt: nowIso(),
        files: currentFiles,
        hfOrgs: currentHf.snapshots,
    };
    writeJson(statePath, nextState);

    const diff = diffStates(previousState, currentFiles);
    const hfFirstBaseline = options.hfOrgs.length > 0 && !previous.hasHfState;
    const hfAdditionsByOrg = hfFirstBaseline
        ? []
        : diffHfOrgAdditions(previousState.hfOrgs, currentHf.snapshots, currentHf.fetchedOrgs, options.hfOrgs);
    const hfAdditionsTotal = countHfAdditions(hfAdditionsByOrg);

    writeJson(reportPath, {
        generatedAt: nowIso(),
        statePath: path.relative(repoRoot, statePath),
        diff,
        hf: {
            configuredOrgs: options.hfOrgs,
            fetchedOrgs: Array.from(currentHf.fetchedOrgs.values()),
            additionsByOrg: hfAdditionsByOrg,
            additionsTotal: hfAdditionsTotal,
            baselineInitialized: hfFirstBaseline,
        },
    });

    console.log(
        `[internal-model-check] Internal model files: ${diff.previousCount} -> ${diff.currentCount} (added=${diff.added.length}, removed=${diff.removed.length}, changed=${diff.changed.length}).`
    );
    if (options.hfOrgs.length > 0) {
        console.log(
            `[internal-model-check] HF orgs configured=${options.hfOrgs.length}, fetched=${currentHf.fetchedOrgs.size}, added=${hfAdditionsTotal}.`
        );
    }

    if (diff.previousCount === 0) {
        console.log("[internal-model-check] Baseline initialized. Skipping first-run notifications.");
        return;
    }

    if (hfFirstBaseline) {
        console.log("[internal-model-check] HF baseline initialized from existing state; skipping HF notifications this run.");
    }

    if (diff.added.length === 0 && diff.removed.length === 0 && hfAdditionsTotal === 0) {
        console.log("[internal-model-check] No internal or HF model additions/removals detected.");
        return;
    }

    if (!options.webhookUrl) {
        const total = diff.added.length + diff.removed.length + hfAdditionsTotal;
        console.log(`[internal-model-check] ${total} model change(s) detected (internal + HF), but no webhook URL was provided.`);
        return;
    }

    const total = diff.added.length + diff.removed.length + hfAdditionsTotal;
    const message = buildDiscordMessage(
        diff.added,
        diff.removed,
        hfAdditionsByOrg,
        currentFiles,
        previousState.files
    );
    console.log(
        `[internal-model-check] ${total} model change(s) detected (${diff.added.length} internal new, ${diff.removed.length} internal removed, ${hfAdditionsTotal} HF new). Sending Discord notification.`
    );
    await sendDiscordWebhook(message, {
        webhookUrl: options.webhookUrl,
        discordUserId: options.discordUserId,
        discordRoleId: options.discordRoleId,
    });
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[internal-model-check] Fatal error: ${message}`);
    process.exitCode = 1;
});
