import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type ModelStatus = "Rumoured" | "Announced" | "Available" | "Deprecated" | "Retired" | null;

type ModelDates = {
    announced_date?: unknown;
    release_date?: unknown;
    deprecation_date?: unknown;
    retirement_date?: unknown;
};

type DerivedStatus = {
    status: Exclude<ModelStatus, null>;
    reason: string;
};

const STATUS_ORDER: Record<Exclude<ModelStatus, null>, number> = {
    Rumoured: 0,
    Announced: 1,
    Available: 2,
    Deprecated: 3,
    Retired: 4,
};

const REPO_ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const CANONICAL_MODELS_ROOT = path.join(REPO_ROOT, "packages", "data", "catalog", "src", "data", "models");
const LEGACY_MODELS_ROOT = path.join(REPO_ROOT, "apps", "web", "src", "data", "models");

function resolveModelsRoot(): string {
    if (fs.existsSync(CANONICAL_MODELS_ROOT)) return CANONICAL_MODELS_ROOT;
    if (fs.existsSync(LEGACY_MODELS_ROOT)) return LEGACY_MODELS_ROOT;
    throw new Error(
        `[update-model-statuses] Could not find models directory at '${path.relative(REPO_ROOT, CANONICAL_MODELS_ROOT)}' or '${path.relative(REPO_ROOT, LEGACY_MODELS_ROOT)}'.`
    );
}

const MODELS_ROOT = resolveModelsRoot();

function parseDate(value: unknown): Date | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== "string") return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? new Date(parsed) : null;
}

function normalizeStatus(value: unknown): ModelStatus {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return (trimmed === "Rumoured" ||
        trimmed === "Announced" ||
        trimmed === "Available" ||
        trimmed === "Deprecated" ||
        trimmed === "Retired")
        ? (trimmed as ModelStatus)
        : null;
}

function deriveStatusFromDates(dates: ModelDates, now: Date): DerivedStatus | null {
    const retirement = parseDate(dates.retirement_date);
    if (retirement && retirement <= now) {
        return { status: "Retired", reason: `retirement_date ${dates.retirement_date}` };
    }

    const deprecation = parseDate(dates.deprecation_date);
    if (deprecation && deprecation <= now) {
        return { status: "Deprecated", reason: `deprecation_date ${dates.deprecation_date}` };
    }

    const release = parseDate(dates.release_date);
    if (release && release <= now) {
        return { status: "Available", reason: `release_date ${dates.release_date}` };
    }

    const announced = parseDate(dates.announced_date);
    if (announced && announced <= now) {
        return { status: "Announced", reason: `announced_date ${dates.announced_date}` };
    }

    return null;
}

function pickStatus(current: ModelStatus, derived: DerivedStatus | null): ModelStatus {
    if (!derived) return current;
    const currentRank = current ? STATUS_ORDER[current] ?? -1 : -1;
    const derivedRank = STATUS_ORDER[derived.status];
    return derivedRank > currentRank ? derived.status : current;
}

function listModelFiles(root: string): string[] {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    const files: string[] = [];

    for (const org of entries.filter((entry) => entry.isDirectory())) {
        const orgPath = path.join(root, org.name);
        const models = fs.readdirSync(orgPath, { withFileTypes: true });
        for (const model of models.filter((entry) => entry.isDirectory())) {
            const modelPath = path.join(orgPath, model.name, "model.json");
            if (fs.existsSync(modelPath)) {
                files.push(modelPath);
            }
        }
    }

    return files;
}

function main() {
    const now = new Date();
    const dryRun = process.argv.includes("--dry-run");
    const modelFiles = listModelFiles(MODELS_ROOT);
    const changes: Array<{ file: string; from: ModelStatus; to: ModelStatus; reason: string }> = [];

    for (const file of modelFiles) {
        const raw = fs.readFileSync(file, "utf-8");
        const data = JSON.parse(raw) as Record<string, unknown>;

        const currentStatus = normalizeStatus(data.status);
        const derived = deriveStatusFromDates(data as ModelDates, now);
        const nextStatus = pickStatus(currentStatus, derived);

        if (nextStatus && nextStatus !== currentStatus) {
            data.status = nextStatus;
            changes.push({
                file: path.relative(REPO_ROOT, file),
                from: currentStatus,
                to: nextStatus,
                reason: derived ? derived.reason : "derived from dates",
            });

            if (!dryRun) {
                const updated = JSON.stringify(data, null, 2);
                fs.writeFileSync(file, `${updated}\n`, "utf-8");
            }
        }
    }

    if (changes.length === 0) {
        console.log("[update-model-statuses] No status changes found.");
        return;
    }

    console.log(`[update-model-statuses] Updated ${changes.length} model${changes.length === 1 ? "" : "s"}.`);
    for (const change of changes) {
        console.log(
            `- ${change.file}: ${change.from ?? "unset"} -> ${change.to} (${change.reason})`
        );
    }

    if (dryRun) {
        console.log("[update-model-statuses] Dry run mode, no files were written.");
    }
}

main();
