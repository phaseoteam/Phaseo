// Watches Hugging Face orgs for new model repos. Scheduled by .github/workflows/huggingface-model-discovery.yml
// through run-hf-private.ts. Phaseo catalogue announcements run in the Cloudflare Worker from the database.
import fs from "node:fs";
import path from "node:path";

type CliOptions = {
    webhookUrl: string | null;
    hfWebhookUrl: string | null;
    discordUserId: string | null;
    discordRoleId: string | null;
    discordAvatarUrl: string | null;
    hfDiscordAvatarUrl: string | null;
    hfOrgs: string[];
    hfToken: string | null;
};

type HuggingFaceOrgSnapshot = {
    fetchedAt: string;
    modelIds: string[];
};

type HuggingFaceDiscoveryState = {
    version: 3;
    generatedAt: string;
    hfOrgs: Record<string, HuggingFaceOrgSnapshot>;
};

type HuggingFaceOrgAdditions = {
    org: string;
    addedModelIds: string[];
};

export type HuggingFaceDiscoveryIssueSignal = HuggingFaceOrgAdditions;

type HuggingFaceDiscoveryHooks = {
    afterHfNotifications?: (hfAdditionsByOrg: HuggingFaceDiscoveryIssueSignal[]) => Promise<void>;
};

const HUGGING_FACE_API_ORIGIN = "https://huggingface.co";
const HUGGING_FACE_MODELS_API_PATH = "/api/models";
const HUGGING_FACE_BASE_URL = "https://huggingface.co";
const PRIVATE_MODEL_DISCOVERY_USERNAME = "Phaseo Private Model Discovery";
const PRIVATE_MODEL_DISCOVERY_AVATAR_URL = "https://phaseo.app/png_logo_dark.png";

function nowIso(): string {
    return new Date().toISOString();
}

function envValue(name: string): string | null {
    const raw = process.env[name];
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    return trimmed || null;
}

function toNullableString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed || null;
}

function parseArgs(argv: string[]): CliOptions {
    let webhookUrl: string | null = null;
    let hfWebhookUrl: string | null = null;
    let discordUserId: string | null = null;
    let discordRoleId: string | null = null;
    let discordAvatarUrl: string | null = null;
    let hfDiscordAvatarUrl: string | null = null;
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

        if (key === "--hf-discord-avatar-url") {
            hfDiscordAvatarUrl = value.trim() || null;
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
        hfWebhookUrl,
        discordUserId,
        discordRoleId,
        discordAvatarUrl,
        hfDiscordAvatarUrl,
        hfOrgs,
        hfToken,
    };
}

function emptyState(): HuggingFaceDiscoveryState {
    return {
        version: 3,
        generatedAt: nowIso(),
        hfOrgs: {},
    };
}

// Older state files also carried a `files` map for the retired catalogue-JSON
// check; only `hfOrgs` is read so cached baselines keep working.
function readState(filePath: string): { state: HuggingFaceDiscoveryState; hasHfState: boolean } {
    if (!fs.existsSync(filePath)) return { state: emptyState(), hasHfState: false };

    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as
            | { version?: number; generatedAt?: unknown; hfOrgs?: unknown }
            | undefined;
        const hasHfState =
            (parsed?.version === 3 || parsed?.version === 2) &&
            parsed.hfOrgs !== null &&
            typeof parsed.hfOrgs === "object";
        if (!parsed || !hasHfState) return { state: emptyState(), hasHfState: false };

        return {
            state: {
                version: 3,
                generatedAt: typeof parsed.generatedAt === "string" ? parsed.generatedAt : nowIso(),
                hfOrgs: parsed.hfOrgs as Record<string, HuggingFaceOrgSnapshot>,
            },
            hasHfState,
        };
    } catch {
        return { state: emptyState(), hasHfState: false };
    }
}

function writeJson(filePath: string, value: unknown): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function writeDiscoveryState(statePath: string, hfOrgs: Record<string, HuggingFaceOrgSnapshot>): void {
    writeJson(statePath, {
        version: 3,
        generatedAt: nowIso(),
        hfOrgs,
    } satisfies HuggingFaceDiscoveryState);
}

function parseNextLink(linkHeader: string | null, currentUrl: string): string | null {
    if (!linkHeader) return null;
    for (const part of linkHeader.split(",")) {
        const section = part.trim();
        if (!section.includes('rel="next"')) continue;
        const start = section.indexOf("<");
        const end = section.indexOf(">");
        if (start === -1 || end === -1 || end <= start + 1) continue;
        const candidate = section.slice(start + 1, end).trim();
        try {
            const next = new URL(candidate, currentUrl);
            if (next.origin !== HUGGING_FACE_API_ORIGIN) return null;
            if (next.pathname !== HUGGING_FACE_MODELS_API_PATH) return null;
            return next.toString();
        } catch {
            return null;
        }
    }
    return null;
}

async function fetchHfOrgModelIds(org: string, hfToken: string | null): Promise<string[]> {
    const headers: Record<string, string> = {};
    if (hfToken) {
        headers.Authorization = `Bearer ${hfToken}`;
    }

    const discovered = new Set<string>();
    let nextUrl: string | null = `https://huggingface.co/api/models?author=${encodeURIComponent(org)}&limit=100&full=false&config=false&cardData=false`;
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

        const linkHeader = response.headers.get("link");
        const parsedNextUrl = parseNextLink(linkHeader, nextUrl);
        if (linkHeader?.includes('rel="next"') && !parsedNextUrl) {
            console.warn(`[hf-model-check] HF org '${org}' returned an unsafe pagination link; ignoring it.`);
        }
        nextUrl = parsedNextUrl;
        pageCount += 1;
    }

    if (nextUrl) {
        console.warn(`[hf-model-check] HF org '${org}' reached pagination cap (${maxPages} pages).`);
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
            console.warn(`[hf-model-check] HF org '${org}' fetch failed: ${message}`);
            if (previousHfOrgs[org]) {
                snapshots[org] = previousHfOrgs[org];
            }
        }
    }

    return { snapshots, fetchedOrgs };
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

function appendBoundedLines(lines: string[], values: string[], maxItems = 40): void {
    const visible = values.slice(0, maxItems);
    for (const value of visible) lines.push(value);
    if (values.length > maxItems) lines.push(`- ...and ${values.length - maxItems} more`);
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

function resolveDiscordAvatarUrl(rawAvatarUrl: string | null | undefined, defaultAvatarUrl: string): string {
    const value = toNullableString(rawAvatarUrl);
    if (!value) return defaultAvatarUrl;
    try {
        const parsed = new URL(value);
        if (parsed.protocol !== "https:") return defaultAvatarUrl;
        return parsed.toString();
    } catch {
        return defaultAvatarUrl;
    }
}

async function sendDiscordWebhook(
    message: string,
    options: {
        webhookUrl: string;
        discordUserId: string | null;
        discordRoleId: string | null;
        avatarUrl?: string | null;
    }
): Promise<void> {
    let parsed: URL;
    try {
        parsed = new URL(options.webhookUrl);
    } catch {
        console.warn("[hf-model-check] Skipping Discord webhook: provided webhook URL is invalid.");
        return;
    }

    if (parsed.protocol !== "https:") {
        console.warn("[hf-model-check] Skipping Discord webhook: webhook URL must use https.");
        return;
    }

    const mentions: string[] = [];
    if (options.discordRoleId) mentions.push(`<@&${options.discordRoleId}>`);
    if (options.discordUserId) mentions.push(`<@${options.discordUserId}>`);
    const content = mentions.length > 0 ? `${mentions.join(" ")}\n${message}` : message;
    const payload: Record<string, unknown> = {
        content,
        username: PRIVATE_MODEL_DISCOVERY_USERNAME,
        avatar_url: resolveDiscordAvatarUrl(options.avatarUrl, PRIVATE_MODEL_DISCOVERY_AVATAR_URL),
    };
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

export async function runHuggingFaceModelDiscovery(argv: string[], hooks: HuggingFaceDiscoveryHooks = {}): Promise<void> {
    const options = parseArgs(argv);
    if (options.hfOrgs.length === 0) {
        console.log("[hf-model-check] No Hugging Face orgs configured (--hf-orgs); nothing to check.");
        return;
    }

    const hfWebhookUrl = options.hfWebhookUrl ?? options.webhookUrl ?? envValue("DISCORD_WEBHOOK_URL");
    const hfDiscordAvatarUrl =
        options.hfDiscordAvatarUrl ??
        options.discordAvatarUrl ??
        envValue("DISCORD_PRIVATE_MODEL_DISCOVERY_AVATAR_URL") ??
        envValue("DISCORD_MODEL_DISCOVERY_AVATAR_URL") ??
        PRIVATE_MODEL_DISCOVERY_AVATAR_URL;
    const repoRoot = process.cwd();
    const stateDir = path.join(repoRoot, "scripts", "model-discovery", "state");
    // File name kept from the combined runner so cached workflow baselines carry over.
    const statePath = path.join(stateDir, "internal-model-files-state.json");
    const reportPath = path.join(stateDir, "last-hf-model-discovery-report.json");

    const previous = readState(statePath);
    const previousHfOrgs = previous.state.hfOrgs;
    const currentHf = await buildCurrentHfOrgMap(options.hfOrgs, options.hfToken, previousHfOrgs);
    const hfFirstBaseline = !previous.hasHfState;
    const hfAdditionsByOrg = hfFirstBaseline
        ? []
        : diffHfOrgAdditions(previousHfOrgs, currentHf.snapshots, currentHf.fetchedOrgs, options.hfOrgs);
    const hfAdditionsTotal = countHfAdditions(hfAdditionsByOrg);

    writeJson(reportPath, {
        generatedAt: nowIso(),
        statePath: path.relative(repoRoot, statePath),
        configuredOrgs: options.hfOrgs,
        fetchedOrgs: Array.from(currentHf.fetchedOrgs.values()),
        additionsByOrg: hfAdditionsByOrg,
        additionsTotal: hfAdditionsTotal,
        baselineInitialized: hfFirstBaseline,
    });

    console.log(
        `[hf-model-check] HF orgs configured=${options.hfOrgs.length}, fetched=${currentHf.fetchedOrgs.size}, added=${hfAdditionsTotal}.`
    );

    if (hfFirstBaseline) {
        writeDiscoveryState(statePath, currentHf.snapshots);
        console.log("[hf-model-check] HF baseline initialized; skipping notifications this run.");
        return;
    }

    if (hfAdditionsTotal === 0) {
        writeDiscoveryState(statePath, currentHf.snapshots);
        console.log("[hf-model-check] No HF additions detected.");
        return;
    }

    if (hooks.afterHfNotifications) {
        await hooks.afterHfNotifications(hfAdditionsByOrg);
    }

    if (!hfWebhookUrl) {
        console.log(`[hf-model-check] ${hfAdditionsTotal} HF model addition(s) detected, but DISCORD_WEBHOOK_URL is missing.`);
        // Hold the baseline so the additions are notified once a webhook is configured.
        writeDiscoveryState(statePath, previousHfOrgs);
        return;
    }

    console.log(`[hf-model-check] ${hfAdditionsTotal} HF model addition(s) detected. Sending Discord notification.`);
    await sendDiscordWebhook(buildHfDiscordMessage(hfAdditionsByOrg), {
        webhookUrl: hfWebhookUrl,
        discordUserId: options.discordUserId,
        discordRoleId: options.discordRoleId,
        avatarUrl: hfDiscordAvatarUrl,
    });

    writeDiscoveryState(statePath, currentHf.snapshots);
}

export const testingExports = {
    parseNextLink,
    readState,
};
