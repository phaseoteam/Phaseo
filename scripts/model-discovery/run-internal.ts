import fs from "node:fs";
import path from "node:path";

type CliOptions = {
    webhookUrl: string | null;
    discordUserId: string | null;
};

type ModelFileSnapshot = {
    filePath: string;
    modelId: string | null;
    modelName: string | null;
};

type InternalModelsFileState = {
    version: 1;
    generatedAt: string;
    files: Record<string, ModelFileSnapshot>;
};

type ModelFileDiff = {
    added: string[];
    removed: string[];
    changed: string[];
    previousCount: number;
    currentCount: number;
};

function nowIso(): string {
    return new Date().toISOString();
}

function parseArgs(argv: string[]): CliOptions {
    let webhookUrl: string | null = null;
    let discordUserId: string | null = null;

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
        }
    }

    return { webhookUrl, discordUserId };
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
        version: 1,
        generatedAt: nowIso(),
        files: {},
    };
}

function readState(filePath: string): InternalModelsFileState {
    if (!fs.existsSync(filePath)) return emptyState();

    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<InternalModelsFileState>;
        if (parsed.version !== 1 || !parsed.files || typeof parsed.files !== "object") {
            return emptyState();
        }
        return {
            version: 1,
            generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : nowIso(),
            files: parsed.files as Record<string, ModelFileSnapshot>,
        };
    } catch {
        return emptyState();
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

function jsonEqual(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}

function diffStates(
    previous: InternalModelsFileState,
    currentFiles: Record<string, ModelFileSnapshot>
): ModelFileDiff {
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

function displayModelName(snapshot: ModelFileSnapshot): string {
    if (snapshot.modelName) return snapshot.modelName;
    if (snapshot.modelId) return snapshot.modelId;

    const parts = snapshot.filePath.split(/[\\/]/g);
    return parts.length >= 2 ? parts[parts.length - 2] : snapshot.filePath;
}

function buildDiscordMessage(addedPaths: string[], filesByPath: Record<string, ModelFileSnapshot>): string {
    const lines = [
        `Detected ${addedPaths.length} new model${addedPaths.length === 1 ? "" : "s"}.`,
        "",
    ];

    for (const filePath of addedPaths) {
        const snapshot = filesByPath[filePath];
        if (!snapshot) continue;
        lines.push(`New Model: ${displayModelName(snapshot)}`);
    }

    const message = lines.join("\n").trim();
    return message.length <= 1900 ? message : `${message.slice(0, 1890)}\n...[truncated]`;
}

async function sendDiscordWebhook(
    message: string,
    options: { webhookUrl: string; discordUserId: string | null }
): Promise<void> {
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

    const content = options.discordUserId ? `<@${options.discordUserId}>\n${message}` : message;
    const payload: Record<string, unknown> = { content };
    if (options.discordUserId) {
        payload.allowed_mentions = { users: [options.discordUserId] };
    }

    const response = await fetch(options.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(
            `Discord webhook failed with HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`
        );
    }
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));
    const repoRoot = process.cwd();
    const stateDir = path.join(repoRoot, "scripts", "model-discovery", "state");
    const statePath = path.join(stateDir, "internal-model-files-state.json");
    const reportPath = path.join(stateDir, "last-internal-model-files-report.json");

    const previousState = readState(statePath);
    const currentFiles = buildCurrentFileMap(repoRoot);
    const nextState: InternalModelsFileState = {
        version: 1,
        generatedAt: nowIso(),
        files: currentFiles,
    };
    writeJson(statePath, nextState);

    const diff = diffStates(previousState, currentFiles);
    writeJson(reportPath, {
        generatedAt: nowIso(),
        statePath: path.relative(repoRoot, statePath),
        diff,
    });

    console.log(
        `[internal-model-check] Model files: ${diff.previousCount} -> ${diff.currentCount} (added=${diff.added.length}, removed=${diff.removed.length}, changed=${diff.changed.length}).`
    );

    if (diff.previousCount === 0) {
        console.log("[internal-model-check] Baseline initialized. Skipping first-run notifications.");
        return;
    }

    if (diff.added.length === 0) {
        console.log("[internal-model-check] No added model files detected.");
        return;
    }

    if (!options.webhookUrl) {
        console.log(
            `[internal-model-check] ${diff.added.length} new model file(s) detected, but no webhook URL was provided.`
        );
        return;
    }

    const message = buildDiscordMessage(diff.added, currentFiles);
    console.log(`[internal-model-check] ${diff.added.length} new model(s) detected. Sending Discord notification.`);
    await sendDiscordWebhook(message, {
        webhookUrl: options.webhookUrl,
        discordUserId: options.discordUserId,
    });
}

main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[internal-model-check] Fatal error: ${message}`);
    process.exitCode = 1;
});
