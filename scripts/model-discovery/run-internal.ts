import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    buildWebhookPayload,
    filterUnannouncedModels,
    sendDiscordWebhookPayload,
    toAnnouncementKey,
    type InternalModelNotificationModel,
} from "../../apps/web/src/lib/model-discovery/internalModelDiscordNotifier";

type CliOptions = {
    webhookUrl: string | null;
    internalWebhookUrl: string | null;
    hfWebhookUrl: string | null;
    discordUserId: string | null;
    discordRoleId: string | null;
    discordAvatarUrl: string | null;
    hfOrgs: string[];
    hfToken: string | null;
    skipInternal: boolean;
    skipHf: boolean;
};

type ModelFileSnapshot = {
    filePath: string;
    modelId: string | null;
    modelName: string | null;
    status: string | null;
    announcedDate: string | null;
    releaseDate: string | null;
    deprecationDate: string | null;
    retirementDate: string | null;
};

type HuggingFaceOrgSnapshot = {
    fetchedAt: string;
    modelIds: string[];
};

type InternalModelsFileState = {
    version: 3;
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

export type HuggingFaceDiscoveryIssueSignal = HuggingFaceOrgAdditions;

type InternalModelDiscoveryHooks = {
    afterHfNotifications?: (hfAdditionsByOrg: HuggingFaceDiscoveryIssueSignal[]) => Promise<void>;
};

type AnnouncedInternalModelsState = {
    version: 1;
    updatedAt: string;
    announcedByModelId: Record<string, string>;
};

const LEGACY_MODELS_ROOT_PREFIX = "apps/web/src/data/models/";
const CANONICAL_MODELS_ROOT_PREFIX = "packages/data/catalog/src/data/models/";

function nowIso(): string {
    return new Date().toISOString();
}

function envValue(name: string): string | null {
    const raw = process.env[name];
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    return trimmed || null;
}

function normalizeRepoRelativePath(filePath: string): string {
    return filePath.replace(/\\/g, "/");
}

function migrateModelRootPrefix(filePath: string): string {
    const normalized = normalizeRepoRelativePath(filePath);
    if (normalized.startsWith(LEGACY_MODELS_ROOT_PREFIX)) {
        return `${CANONICAL_MODELS_ROOT_PREFIX}${normalized.slice(LEGACY_MODELS_ROOT_PREFIX.length)}`;
    }
    return normalized;
}

function toNullableString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed || null;
}

function toNullableDateString(value: unknown): string | null {
    const normalized = toNullableString(value);
    if (!normalized) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized;
    const parsed = Date.parse(normalized);
    if (!Number.isFinite(parsed)) return normalized;
    return new Date(parsed).toISOString().slice(0, 10);
}

function parseArgs(argv: string[]): CliOptions {
    let webhookUrl: string | null = null;
    let internalWebhookUrl: string | null = null;
    let hfWebhookUrl: string | null = null;
    let discordUserId: string | null = null;
    let discordRoleId: string | null = null;
    let discordAvatarUrl: string | null = null;
    let hfToken: string | null = null;
    let skipInternal = false;
    let skipHf = false;
    const hfOrgs: string[] = [];

    for (let index = 0; index < argv.length; index += 1) {
        const key = argv[index];
        const value = argv[index + 1];
        if (!key?.startsWith("--")) continue;

        if (key === "--skip-internal") {
            skipInternal = true;
            continue;
        }

        if (key === "--skip-hf") {
            skipHf = true;
            continue;
        }

        if (value === undefined || value.startsWith("--")) continue;

        if (key === "--webhook-url") {
            webhookUrl = value.trim() || null;
            index += 1;
            continue;
        }

        if (key === "--internal-webhook-url") {
            internalWebhookUrl = value.trim() || null;
            index += 1;
            continue;
        }

        if (key === "--hf-webhook-url") {
            hfWebhookUrl = value.trim() || null;
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

        if (key === "--discord-avatar-url") {
            discordAvatarUrl = value.trim() || null;
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

    return {
        webhookUrl,
        internalWebhookUrl,
        hfWebhookUrl,
        discordUserId,
        discordRoleId,
        discordAvatarUrl,
        hfOrgs,
        hfToken,
        skipInternal,
        skipHf,
    };
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

        const modelId = toNullableString(parsed.model_id);
        const modelName = toNullableString(parsed.name);
        const status = toNullableString(parsed.status);
        const announcedDate = toNullableDateString(parsed.announced_date);
        const releaseDate = toNullableDateString(parsed.release_date);
        const deprecationDate = toNullableDateString(parsed.deprecation_date);
        const retirementDate = toNullableDateString(parsed.retirement_date);

        return {
            filePath: migrateModelRootPrefix(path.relative(repoRoot, filePath)),
            modelId,
            modelName,
            status,
            announcedDate,
            releaseDate,
            deprecationDate,
            retirementDate,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[internal-model-check] Failed to read ${path.relative(repoRoot, filePath)}: ${message}`);
        return null;
    }
}

function normalizeStateFiles(files: Record<string, unknown>): Record<string, ModelFileSnapshot> {
    const map = new Map<string, ModelFileSnapshot>();
    for (const [rawPath, rawSnapshot] of Object.entries(files)) {
        const normalizedPath = migrateModelRootPrefix(rawPath);
        const snapshot = rawSnapshot as Partial<ModelFileSnapshot> | null;
        const modelId =
            typeof snapshot?.modelId === "string" && snapshot.modelId.trim()
                ? snapshot.modelId.trim()
                : null;
        const modelName =
            typeof snapshot?.modelName === "string" && snapshot.modelName.trim()
                ? snapshot.modelName.trim()
                : null;
        const status =
            typeof snapshot?.status === "string" && snapshot.status.trim()
                ? snapshot.status.trim()
                : null;
        const announcedDate = toNullableDateString(snapshot?.announcedDate);
        const releaseDate = toNullableDateString(snapshot?.releaseDate);
        const deprecationDate = toNullableDateString(snapshot?.deprecationDate);
        const retirementDate = toNullableDateString(snapshot?.retirementDate);

        map.set(normalizedPath, {
            filePath: normalizedPath,
            modelId,
            modelName,
            status,
            announcedDate,
            releaseDate,
            deprecationDate,
            retirementDate,
        });
    }

    return Object.fromEntries(Array.from(map.entries()).sort(([left], [right]) => left.localeCompare(right)));
}

function emptyState(): InternalModelsFileState {
    return {
        version: 3,
        generatedAt: nowIso(),
        files: {},
        hfOrgs: {},
    };
}

function emptyAnnouncedState(): AnnouncedInternalModelsState {
    return {
        version: 1,
        updatedAt: nowIso(),
        announcedByModelId: {},
    };
}

function readAnnouncedState(filePath: string): AnnouncedInternalModelsState {
    if (!fs.existsSync(filePath)) return emptyAnnouncedState();
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as
            | Partial<AnnouncedInternalModelsState>
            | undefined;
        if (!parsed || typeof parsed !== "object") return emptyAnnouncedState();
        if (parsed.version !== 1 || !parsed.announcedByModelId || typeof parsed.announcedByModelId !== "object") {
            return emptyAnnouncedState();
        }

        const normalizedEntries = Object.entries(parsed.announcedByModelId)
            .map(([rawModelId, announcedAt]) => {
                const modelId = rawModelId.trim().toLowerCase();
                if (!modelId) return null;
                const normalizedAnnouncedAt =
                    typeof announcedAt === "string" && announcedAt.trim() ? announcedAt.trim() : nowIso();
                return [modelId, normalizedAnnouncedAt] as const;
            })
            .filter((entry): entry is readonly [string, string] => Boolean(entry));

        return {
            version: 1,
            updatedAt: typeof parsed.updatedAt === "string" && parsed.updatedAt.trim() ? parsed.updatedAt.trim() : nowIso(),
            announcedByModelId: Object.fromEntries(normalizedEntries),
        };
    } catch {
        return emptyAnnouncedState();
    }
}

function readState(filePath: string): { state: InternalModelsFileState; hasHfState: boolean; sourceVersion: number | null } {
    if (!fs.existsSync(filePath)) {
        return { state: emptyState(), hasHfState: false, sourceVersion: null };
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as
            | (Partial<InternalModelsFileState> & { version?: number; hfOrgs?: unknown })
            | undefined;

        if (!parsed?.files || typeof parsed.files !== "object") {
            return { state: emptyState(), hasHfState: false, sourceVersion: null };
        }

        const normalizedFiles = normalizeStateFiles(parsed.files as Record<string, unknown>);
        const sourceVersion =
            typeof parsed.version === "number" && Number.isFinite(parsed.version)
                ? parsed.version
                : 1;

        if (parsed.version === 3 || parsed.version === 2) {
            const hasHfState = parsed.hfOrgs !== undefined && typeof parsed.hfOrgs === "object";
            return {
                state: {
                    version: 3,
                    generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : nowIso(),
                    files: normalizedFiles,
                    hfOrgs: hasHfState ? (parsed.hfOrgs as Record<string, HuggingFaceOrgSnapshot>) : {},
                },
                hasHfState,
                sourceVersion,
            };
        }

        // Backward compatibility with v1 state (no hfOrgs key).
        return {
            state: {
                version: 3,
                generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : nowIso(),
                files: normalizedFiles,
                hfOrgs: {},
            },
            hasHfState: false,
            sourceVersion,
        };
    } catch {
        return { state: emptyState(), hasHfState: false, sourceVersion: null };
    }
}

function writeJson(filePath: string, value: unknown): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function writeDiscoveryState(
    statePath: string,
    files: Record<string, ModelFileSnapshot>,
    hfOrgs: Record<string, HuggingFaceOrgSnapshot>
): void {
    writeJson(statePath, {
        version: 3,
        generatedAt: nowIso(),
        files,
        hfOrgs,
    } satisfies InternalModelsFileState);
}

function buildCurrentFileMap(repoRoot: string): Record<string, ModelFileSnapshot> {
    const canonicalModelsRoot = path.join(repoRoot, "packages", "data", "catalog", "src", "data", "models");
    const legacyModelsRoot = path.join(repoRoot, "apps", "web", "src", "data", "models");
    const modelsRoot = fs.existsSync(canonicalModelsRoot)
        ? canonicalModelsRoot
        : fs.existsSync(legacyModelsRoot)
            ? legacyModelsRoot
            : null;
    if (!modelsRoot) {
        console.warn(
            `[internal-model-check] No models directory found at '${CANONICAL_MODELS_ROOT_PREFIX}' or '${LEGACY_MODELS_ROOT_PREFIX}'.`
        );
        return {};
    }

    const files = collectModelJsonFiles(modelsRoot);
    const map = new Map<string, ModelFileSnapshot>();

    for (const absoluteFilePath of files) {
        const snapshot = readModelFileSnapshot(absoluteFilePath, repoRoot);
        if (!snapshot) continue;
        map.set(snapshot.filePath, snapshot);
    }

    return Object.fromEntries(Array.from(map.entries()).sort(([left], [right]) => left.localeCompare(right)));
}

function normalizeHexColour(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const raw = value.trim();
    if (!raw) return null;
    const normalized = raw.startsWith("#") ? raw.slice(1) : raw;
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
    return `#${normalized.toLowerCase()}`;
}

type OrganisationMeta = {
    name?: string;
    colour?: string;
};

function buildOrganisationMetaMap(repoRoot: string): Record<string, OrganisationMeta> {
    const map = new Map<string, OrganisationMeta>();
    const canonicalRoot = path.join(repoRoot, "packages", "data", "catalog", "src", "data", "organisations");
    const legacyRoot = path.join(repoRoot, "apps", "web", "src", "data", "organisations");
    const root = fs.existsSync(canonicalRoot) ? canonicalRoot : fs.existsSync(legacyRoot) ? legacyRoot : null;
    if (!root) return {};

    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const organisationFile = path.join(root, entry.name, "organisation.json");
        if (!fs.existsSync(organisationFile)) continue;
        try {
            const parsed = JSON.parse(fs.readFileSync(organisationFile, "utf-8")) as Record<string, unknown>;
            const organisationId =
                typeof parsed.organisation_id === "string" && parsed.organisation_id.trim()
                    ? parsed.organisation_id.trim().toLowerCase()
                    : entry.name.trim().toLowerCase();
            const organisationName =
                typeof parsed.name === "string" && parsed.name.trim()
                    ? parsed.name.trim()
                    : null;
            const colour =
                normalizeHexColour(parsed.colour) ??
                normalizeHexColour(parsed.color) ??
                normalizeHexColour(parsed.colour_hex);
            if (!organisationId) continue;
            map.set(organisationId, {
                name: organisationName ?? undefined,
                colour: colour ?? undefined,
            });
        } catch {
            // ignore malformed organisation records
        }
    }

    return Object.fromEntries(Array.from(map.entries()));
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

type ModelPathInfo = {
    organisationId: string;
    modelSlug: string;
};

function parseModelPathInfo(filePath: string): ModelPathInfo | null {
    const parts = filePath.split(/[\\/]+/g);
    const modelsIndex = parts.indexOf("models");
    if (modelsIndex === -1 || modelsIndex + 2 >= parts.length) return null;
    const organisationId = parts[modelsIndex + 1]?.trim();
    const modelSlug = parts[modelsIndex + 2]?.trim();
    if (!organisationId || !modelSlug) return null;
    return { organisationId, modelSlug };
}

function buildInternalModelLink(snapshot: ModelFileSnapshot): string | null {
    const pathInfo = parseModelPathInfo(snapshot.filePath);
    if (!pathInfo) return null;
    const { organisationId, modelSlug } = pathInfo;
    return `${MODEL_DETAILS_BASE_URL}/models/${encodeURIComponent(organisationId)}/${encodeURIComponent(modelSlug)}`;
}

function getOrganisationIdFromSnapshot(snapshot: ModelFileSnapshot): string | null {
    const fromModelId = snapshot.modelId?.split("/")[0]?.trim().toLowerCase();
    if (fromModelId) return fromModelId;

    const pathInfo = parseModelPathInfo(snapshot.filePath);
    return pathInfo?.organisationId.toLowerCase() ?? null;
}

function resolveModelIdFromSnapshot(snapshot: ModelFileSnapshot): string | null {
    const fromFile = snapshot.modelId?.trim();
    if (fromFile) return fromFile;
    const pathInfo = parseModelPathInfo(snapshot.filePath);
    if (!pathInfo) return null;
    // Preserve notifications when model.json is malformed and missing model_id.
    return `${pathInfo.organisationId}/${pathInfo.modelSlug}`;
}

function toInternalNotificationModel(
    snapshot: ModelFileSnapshot,
    organisationMetaMap: Record<string, OrganisationMeta>
): InternalModelNotificationModel | null {
    const modelUrl = buildInternalModelLink(snapshot);
    if (!modelUrl) return null;
    const modelId = resolveModelIdFromSnapshot(snapshot);
    if (!modelId) return null;
    const creatorId = getOrganisationIdFromSnapshot(snapshot);
    const creatorMeta = creatorId ? organisationMetaMap[creatorId] : undefined;
    return {
        modelId,
        modelName: displayModelName(snapshot),
        modelUrl,
        creatorId: creatorId ?? undefined,
        creatorName: creatorMeta?.name,
        creatorColor: creatorMeta?.colour,
    };
}

function formatStatusValue(status: string | null): string {
    return status ?? "Not set";
}

function formatDateValue(value: string | null): string {
    if (!value) return "Not set";
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return value;
    return parsed.toLocaleDateString("en-GB", {
        year: "numeric",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
    });
}

function buildAddedModelSummaryLines(snapshot: ModelFileSnapshot): string[] {
    const lines = [`Event: Added`, `Status: ${formatStatusValue(snapshot.status)}`];
    if (snapshot.announcedDate) lines.push(`Announced: ${formatDateValue(snapshot.announcedDate)}`);
    if (snapshot.releaseDate) lines.push(`Release: ${formatDateValue(snapshot.releaseDate)}`);
    if (snapshot.deprecationDate) lines.push(`Deprecation: ${formatDateValue(snapshot.deprecationDate)}`);
    if (snapshot.retirementDate) lines.push(`Retirement: ${formatDateValue(snapshot.retirementDate)}`);
    return lines;
}

function buildUpdatedModelSummaryLines(previous: ModelFileSnapshot, current: ModelFileSnapshot): string[] {
    const lines: string[] = ["Event: Updated"];

    if (previous.status !== current.status) {
        lines.push(`Status: ${formatStatusValue(previous.status)} -> ${formatStatusValue(current.status)}`);
    }
    if (previous.announcedDate !== current.announcedDate) {
        lines.push(`Announced: ${formatDateValue(previous.announcedDate)} -> ${formatDateValue(current.announcedDate)}`);
    }
    if (previous.releaseDate !== current.releaseDate) {
        lines.push(`Release: ${formatDateValue(previous.releaseDate)} -> ${formatDateValue(current.releaseDate)}`);
    }
    if (previous.deprecationDate !== current.deprecationDate) {
        lines.push(
            `Deprecation: ${formatDateValue(previous.deprecationDate)} -> ${formatDateValue(current.deprecationDate)}`
        );
    }
    if (previous.retirementDate !== current.retirementDate) {
        lines.push(`Retirement: ${formatDateValue(previous.retirementDate)} -> ${formatDateValue(current.retirementDate)}`);
    }

    return lines.length > 1 ? lines : [];
}

function buildHfModelLine(modelId: string): string {
    const normalized = modelId.trim();
    if (!normalized) return "- Unknown HF model";
    return `- ${normalized} <${HUGGING_FACE_BASE_URL}/${normalized}>`;
}

function buildHfDiscordMessage(hfAdditionsByOrg: HuggingFaceOrgAdditions[]): string {
    const total = countHfAdditions(hfAdditionsByOrg);
    const lines: string[] = [
        `External model discovery detected via Hugging Face (${total} model${total === 1 ? "" : "s"} across ${hfAdditionsByOrg.length} org${hfAdditionsByOrg.length === 1 ? "" : "s"}).`,
        "",
    ];

    for (const orgEntry of hfAdditionsByOrg) {
        lines.push(`New Hugging Face Models from ${orgEntry.org} (${orgEntry.addedModelIds.length}):`);
        appendBoundedLines(lines, orgEntry.addedModelIds.map(buildHfModelLine));
        lines.push("");
    }

    const message = lines.join("\n").trim();
    return message.length <= 1900 ? message : `${message.slice(0, 1890)}\n...[truncated]`;
}

async function sendDiscordWebhook(
    message: string,
    options: {
        webhookUrl: string;
        discordUserId: string | null;
        discordRoleId: string | null;
        includeMentions?: boolean;
    }
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

    const mentions: string[] = [];
    if (options.includeMentions !== false) {
        if (options.discordRoleId) mentions.push(`<@&${options.discordRoleId}>`);
        if (options.discordUserId) mentions.push(`<@${options.discordUserId}>`);
    }
    const content = mentions.length > 0 ? `${mentions.join(" ")}\n${message}` : message;
    const payload: Record<string, unknown> = { content };
    if (options.includeMentions !== false && (options.discordUserId || options.discordRoleId)) {
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

export async function runInternalModelDiscovery(argv: string[], hooks: InternalModelDiscoveryHooks = {}): Promise<void> {
    const options = parseArgs(argv);
    const internalWebhookUrl =
        options.internalWebhookUrl ??
        options.webhookUrl ??
        envValue("DISCORD_WEBHOOK_NEW_MODELS_PUBLIC");
    const hfWebhookUrl =
        options.hfWebhookUrl ??
        options.webhookUrl ??
        envValue("DISCORD_WEBHOOK_URL");
    const shouldCheckInternal = !options.skipInternal;
    const shouldCheckHf = !options.skipHf && options.hfOrgs.length > 0;
    const repoRoot = process.cwd();
    const stateDir = path.join(repoRoot, "scripts", "model-discovery", "state");
    const statePath = path.join(stateDir, "internal-model-files-state.json");
    const announcedStatePath = path.join(stateDir, "internal-announced-models.json");
    const reportPath = path.join(stateDir, "last-internal-model-files-report.json");

    const previous = readState(statePath);
    const previousState = previous.state;
    const currentFiles = shouldCheckInternal ? buildCurrentFileMap(repoRoot) : previousState.files;
    const organisationMetaMap = shouldCheckInternal ? buildOrganisationMetaMap(repoRoot) : {};
    const currentHf = shouldCheckHf
        ? await buildCurrentHfOrgMap(options.hfOrgs, options.hfToken, previousState.hfOrgs)
        : { snapshots: previousState.hfOrgs, fetchedOrgs: new Set<string>() };

    const diff = diffStates(previousState, currentFiles);
    const announcedState = readAnnouncedState(announcedStatePath);
    const detectedInternalAddedModels = shouldCheckInternal
        ? diff.added
            .map((filePath) => currentFiles[filePath])
            .filter((snapshot): snapshot is ModelFileSnapshot => Boolean(snapshot))
            .map((snapshot) => {
                const model = toInternalNotificationModel(snapshot, organisationMetaMap);
                if (!model) return null;
                return {
                    ...model,
                    changeSummaryLines: buildAddedModelSummaryLines(snapshot),
                } satisfies InternalModelNotificationModel;
            })
            .filter((snapshot): snapshot is InternalModelNotificationModel => Boolean(snapshot))
        : [];
    const newInternalModels = filterUnannouncedModels(detectedInternalAddedModels, announcedState.announcedByModelId);
    const skippedAlreadyAnnouncedInternal = Math.max(
        0,
        detectedInternalAddedModels.length - newInternalModels.length
    );
    const detectedInternalUpdatedModels = shouldCheckInternal
        ? diff.changed
            .map((filePath) => {
                const previousSnapshot = previousState.files[filePath];
                const currentSnapshot = currentFiles[filePath];
                if (!previousSnapshot || !currentSnapshot) return null;
                const changeSummaryLines = buildUpdatedModelSummaryLines(previousSnapshot, currentSnapshot);
                if (changeSummaryLines.length === 0) return null;
                const model = toInternalNotificationModel(currentSnapshot, organisationMetaMap);
                if (!model) return null;
                return {
                    ...model,
                    changeSummaryLines,
                } satisfies InternalModelNotificationModel;
            })
            .filter((snapshot): snapshot is InternalModelNotificationModel => Boolean(snapshot))
        : [];
    const suppressLegacyLifecycleBackfillUpdates =
        shouldCheckInternal &&
        previous.sourceVersion !== null &&
        previous.sourceVersion < 3 &&
        detectedInternalUpdatedModels.length > 0;
    const internalUpdatedModels = suppressLegacyLifecycleBackfillUpdates
        ? []
        : detectedInternalUpdatedModels;
    const suppressedLegacyLifecycleUpdates = suppressLegacyLifecycleBackfillUpdates
        ? detectedInternalUpdatedModels.length
        : 0;
    const internalNotificationModels = [...newInternalModels, ...internalUpdatedModels];
    const internalAdditionsCount = shouldCheckInternal ? newInternalModels.length : 0;
    const internalUpdatesCount = shouldCheckInternal ? internalUpdatedModels.length : 0;
    const internalNotificationCount = internalNotificationModels.length;

    const hfFirstBaseline = shouldCheckHf && !previous.hasHfState;
    const hfAdditionsByOrg = !shouldCheckHf || hfFirstBaseline
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
        internalNotification: {
            detectedAdded: detectedInternalAddedModels.length,
            detectedUpdated: internalUpdatesCount,
            newlyAnnouncedAdded: newInternalModels.length,
            notifiedUpdates: internalUpdatesCount,
            skippedAlreadyAnnounced: skippedAlreadyAnnouncedInternal,
            suppressedLegacyLifecycleUpdates,
            announcedStatePath: path.relative(repoRoot, announcedStatePath),
        },
    });

    if (shouldCheckInternal) {
        console.log(
            `[internal-model-check] Internal model files: ${diff.previousCount} -> ${diff.currentCount} (added=${diff.added.length}, removed=${diff.removed.length}, changed=${diff.changed.length}).`
        );
        if (skippedAlreadyAnnouncedInternal > 0) {
            console.log(
                `[internal-model-check] Internal additions skipped as already announced: ${skippedAlreadyAnnouncedInternal}.`
            );
        }
        if (internalUpdatesCount > 0) {
            console.log(`[internal-model-check] Internal model updates detected: ${internalUpdatesCount}.`);
        }
        if (suppressedLegacyLifecycleUpdates > 0) {
            console.log(
                `[internal-model-check] Suppressed ${suppressedLegacyLifecycleUpdates} lifecycle update notification(s) while upgrading legacy discovery state.`
            );
        }
    } else {
        console.log("[internal-model-check] Internal model diff disabled (--skip-internal).");
    }
    if (options.hfOrgs.length > 0 && shouldCheckHf) {
        console.log(
            `[internal-model-check] HF orgs configured=${options.hfOrgs.length}, fetched=${currentHf.fetchedOrgs.size}, added=${hfAdditionsTotal}.`
        );
    } else if (options.hfOrgs.length > 0 && !shouldCheckHf) {
        console.log("[internal-model-check] HF org checks disabled (--skip-hf).");
    }

    if (shouldCheckInternal && diff.previousCount === 0) {
        writeDiscoveryState(statePath, currentFiles, currentHf.snapshots);
        console.log("[internal-model-check] Baseline initialized. Skipping first-run notifications.");
        return;
    }

    if (hfFirstBaseline) {
        console.log("[internal-model-check] HF baseline initialized from existing state; skipping HF notifications this run.");
    }

    if (internalNotificationCount === 0 && hfAdditionsTotal === 0) {
        writeDiscoveryState(statePath, currentFiles, currentHf.snapshots);
        console.log("[internal-model-check] No internal model updates/additions or HF additions detected.");
        return;
    }

    if (internalNotificationCount > 0 && !internalWebhookUrl) {
        console.log(
            `[internal-model-check] ${internalNotificationCount} internal model notification(s) detected, but DISCORD_WEBHOOK_NEW_MODELS_PUBLIC is missing.`
        );
    }
    if (hfAdditionsTotal > 0 && !hfWebhookUrl) {
        console.log(
            `[internal-model-check] ${hfAdditionsTotal} HF model addition(s) detected, but DISCORD_WEBHOOK_URL is missing.`
        );
    }

    const shouldSendInternal = shouldCheckInternal && internalNotificationCount > 0 && Boolean(internalWebhookUrl);
    const shouldSendHf = shouldCheckHf && hfAdditionsTotal > 0 && Boolean(hfWebhookUrl);
    const holdInternalBaseline = shouldCheckInternal && internalNotificationCount > 0 && !shouldSendInternal;
    const holdHfBaseline = shouldCheckHf && hfAdditionsTotal > 0 && !shouldSendHf;

    if (!shouldSendInternal && !shouldSendHf) {
        if (shouldCheckHf && hfAdditionsTotal > 0 && hooks.afterHfNotifications) {
            await hooks.afterHfNotifications(hfAdditionsByOrg);
        }
        writeDiscoveryState(
            statePath,
            holdInternalBaseline ? previousState.files : currentFiles,
            holdHfBaseline ? previousState.hfOrgs : currentHf.snapshots
        );
        return;
    }

    console.log(
        `[internal-model-check] Changes detected (${internalAdditionsCount} internal added, ${internalUpdatesCount} internal updated, ${diff.removed.length} internal removed, ${hfAdditionsTotal} HF new). Sending Discord notification${shouldSendInternal && shouldSendHf ? "s" : ""}.`
    );

    let mentionsSent = false;
    const shouldRunHfNotificationHook = shouldCheckHf && hfAdditionsTotal > 0 && Boolean(hooks.afterHfNotifications);

    if (shouldSendInternal && internalWebhookUrl) {
        const avatarUrl = options.discordAvatarUrl ?? null;
        const payload = buildWebhookPayload(internalNotificationModels, options.discordRoleId, {
            discordUserId: options.discordUserId,
            includeMentions: true,
            avatarUrl,
            maxModelEmbeds: 10,
        });

        const nextAnnounced = { ...announcedState.announcedByModelId };
        const markedAt = nowIso();
        for (const model of newInternalModels) {
            nextAnnounced[toAnnouncementKey(model)] = markedAt;
        }
        const nextAnnouncedState: AnnouncedInternalModelsState = {
            version: 1,
            updatedAt: markedAt,
            announcedByModelId: nextAnnounced,
        };
        writeJson(announcedStatePath, nextAnnouncedState);

        try {
            await sendDiscordWebhookPayload(internalWebhookUrl, payload, {
                maxAttempts: 3,
                timeoutMs: 10_000,
                retryDelayMs: 750,
                logger: console,
            });
        } catch (error) {
            // Roll back pre-send mark so failed sends can be retried cleanly.
            writeJson(announcedStatePath, announcedState);
            throw error;
        }
        mentionsSent = true;
    }

    if (shouldRunHfNotificationHook && shouldSendHf) {
        await hooks.afterHfNotifications?.(hfAdditionsByOrg);
    }

    let hfNotificationError: unknown = null;
    if (shouldSendHf && hfWebhookUrl) {
        const hfMessage = buildHfDiscordMessage(hfAdditionsByOrg);
        try {
            await sendDiscordWebhook(hfMessage, {
                webhookUrl: hfWebhookUrl,
                discordUserId: options.discordUserId,
                discordRoleId: options.discordRoleId,
                includeMentions: !mentionsSent,
            });
        } catch (error) {
            hfNotificationError = error;
        }
    }

    if (shouldRunHfNotificationHook && !shouldSendHf) {
        await hooks.afterHfNotifications?.(hfAdditionsByOrg);
    }

    if (hfNotificationError) {
        throw hfNotificationError;
    }

    writeDiscoveryState(
        statePath,
        holdInternalBaseline ? previousState.files : currentFiles,
        holdHfBaseline ? previousState.hfOrgs : currentHf.snapshots
    );
}

function isMainModule(): boolean {
    const entry = process.argv[1];
    if (!entry) return false;
    return path.resolve(entry) === path.resolve(fileURLToPath(import.meta.url));
}

if (isMainModule()) {
    runInternalModelDiscovery(process.argv.slice(2)).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[internal-model-check] Fatal error: ${message}`);
        process.exitCode = 1;
    });
}
