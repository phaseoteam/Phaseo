import fs from "node:fs";
import path from "node:path";

export type ProviderIssueChangeAction = "create" | "update" | "delete";

export type ProviderIssueChangeEntry = {
    ts: string;
    action: ProviderIssueChangeAction;
    platformId: string;
    platformName: string;
    providerId: string;
    providerName: string;
    modelId: string;
};

type ProviderIssueHistoryEvent = ProviderIssueChangeEntry & {
    runUrl?: string;
};

type ProviderIssueRecord = {
    issueNumber?: number;
    issueUrl?: string;
    recentEvents: ProviderIssueHistoryEvent[];
    updatedAt: string;
};

type ProviderIssueState = {
    version: 1;
    updatedAt: string;
    issues: Record<string, ProviderIssueRecord>;
};

type GitHubIssue = {
    number: number;
    html_url: string;
    state: string;
    title?: string;
    body?: string;
};

type GitHubSearchResponse = {
    items?: GitHubIssue[];
};

type GitHubIssueSyncOptions = {
    token?: string | null;
    repository?: string | null;
    apiBaseUrl?: string | null;
    statePath: string;
    runUrl?: string | null;
    knownModelIdsByProvider?: Map<string, Set<string>>;
    logger?: Pick<Console, "log" | "warn">;
    requestImpl?: typeof fetch;
};

type GitHubIssueClient = {
    getIssue(issueNumber: number): Promise<GitHubIssue | null>;
    searchOpenIssue(query: string): Promise<GitHubIssue | null>;
    createIssue(input: { title: string; body: string }): Promise<GitHubIssue>;
    updateIssue(issueNumber: number, input: { title?: string; body?: string }): Promise<GitHubIssue>;
    createComment(issueNumber: number, body: string): Promise<void>;
};

const MAX_RECENT_EVENTS = 20;
const DEFAULT_GITHUB_API_BASE_URL = "https://api.github.com";

function canonicalModelId(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, "");
}

function filterEntriesByKnownProviderModels(
    entries: ProviderIssueChangeEntry[],
    knownModelIdsByProvider: Map<string, Set<string>> | undefined
): ProviderIssueChangeEntry[] {
    if (!knownModelIdsByProvider) return entries;

    return entries.filter((entry) => {
        const knownModelIds = knownModelIdsByProvider.get(entry.providerId);
        return Boolean(knownModelIds?.has(canonicalModelId(entry.modelId)));
    });
}

function nowIso(): string {
    return new Date().toISOString();
}

function trimOrNull(value: string | null | undefined): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed || null;
}

function readIssueState(filePath: string): ProviderIssueState {
    if (!fs.existsSync(filePath)) {
        return {
            version: 1,
            updatedAt: nowIso(),
            issues: {},
        };
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<ProviderIssueState> | undefined;
        if (!parsed || parsed.version !== 1 || !parsed.issues || typeof parsed.issues !== "object") {
            throw new Error("Invalid issue state");
        }

        return {
            version: 1,
            updatedAt: trimOrNull(parsed.updatedAt) ?? nowIso(),
            issues: Object.fromEntries(
                Object.entries(parsed.issues).map(([key, record]) => {
                    const recentEvents = Array.isArray(record?.recentEvents)
                        ? record.recentEvents.filter(isProviderIssueHistoryEvent).slice(0, MAX_RECENT_EVENTS)
                        : [];
                    return [
                        key,
                        {
                            issueNumber: typeof record?.issueNumber === "number" ? record.issueNumber : undefined,
                            issueUrl: trimOrNull(record?.issueUrl) ?? undefined,
                            recentEvents,
                            updatedAt: trimOrNull(record?.updatedAt) ?? nowIso(),
                        } satisfies ProviderIssueRecord,
                    ];
                })
            ),
        };
    } catch {
        return {
            version: 1,
            updatedAt: nowIso(),
            issues: {},
        };
    }
}

function writeIssueState(filePath: string, state: ProviderIssueState): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

function isProviderIssueHistoryEvent(value: unknown): value is ProviderIssueHistoryEvent {
    if (!value || typeof value !== "object") return false;
    const row = value as Partial<ProviderIssueHistoryEvent>;
    return (
        typeof row.ts === "string" &&
        (row.action === "create" || row.action === "update" || row.action === "delete") &&
        typeof row.platformId === "string" &&
        typeof row.platformName === "string" &&
        typeof row.providerId === "string" &&
        typeof row.providerName === "string" &&
        typeof row.modelId === "string"
    );
}

type ProviderIssueGroup = {
    key: string;
    action: ProviderIssueChangeAction;
    platformId: string;
    platformName: string;
    providerId: string;
    providerName: string;
    entries: ProviderIssueChangeEntry[];
};

function issueKeyForGroup(input: Pick<ProviderIssueChangeEntry, "providerId" | "action">): string {
    return Buffer.from(`${input.providerId.trim().toLowerCase()}\n${input.action}`).toString("base64url");
}

function markerForKey(key: string): string {
    return `ai-stats-model-discovery:${key}`;
}

function actionNoun(action: ProviderIssueChangeAction): string {
    if (action === "create") return "additions";
    if (action === "delete") return "deletions";
    return "changes";
}

function actionVerb(action: ProviderIssueChangeAction): string {
    if (action === "create") return "added";
    if (action === "delete") return "removed";
    return "changed";
}

function issueTitleForGroup(group: ProviderIssueGroup): string {
    return `[model-discovery] ${group.providerName}: provider model ${actionNoun(group.action)}`.slice(0, 250);
}

function formatDateTime(value: string): string {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return value;
    return parsed.toISOString();
}

function formatEventLine(event: ProviderIssueHistoryEvent): string {
    const runSuffix = event.runUrl ? ` ([workflow run](${event.runUrl}))` : "";
    return `- ${formatDateTime(event.ts)}: ${actionVerb(event.action)} \`${event.modelId}\` on ${event.providerName} (${event.providerId})${runSuffix}`;
}

function formatModelList(modelIds: string[]): string[] {
    return modelIds.map((modelId) => `- \`${modelId}\``);
}

function buildIssueBody(args: {
    group: ProviderIssueGroup;
    recentEvents: ProviderIssueHistoryEvent[];
}): string {
    const { group, recentEvents } = args;
    const marker = markerForKey(group.key);
    const latestEvent = recentEvents[0] ?? group.entries[0];
    const eventLines = recentEvents.length > 0 ? recentEvents.map(formatEventLine) : group.entries.map(formatEventLine);
    const modelIds = group.entries.map((entry) => entry.modelId);

    return [
        `<!-- ${marker} -->`,
        `Tracking key: \`${marker}\``,
        "",
        `The model discovery bot detected upstream provider model ${actionNoun(group.action)} for ${group.providerName}.`,
        "",
        "## Current signal",
        `- Cloud platform: ${group.platformName} (\`${group.platformId}\`)`,
        `- Provider: ${group.providerName} (\`${group.providerId}\`)`,
        `- Latest action: ${actionNoun(group.action)}`,
        `- Latest detected at: ${latestEvent ? formatDateTime(latestEvent.ts) : "Unknown"}`,
        `- Models in this signal: ${modelIds.length}`,
        "",
        "## Models in this signal",
        ...formatModelList(modelIds),
        "",
        "## Recent detections",
        ...eventLines,
        "",
        "## Triage notes",
        "- Reuse this issue for repeated signals with the same provider and action type.",
        "- Only provider model IDs already present in `data_api_provider_models` are included here.",
        "- Close this issue when the catalog has been updated or the upstream signal is confirmed as non-actionable.",
    ].join("\n");
}

function buildIssueComment(group: ProviderIssueGroup, events: ProviderIssueHistoryEvent[]): string {
    return [
        `Model discovery detected another ${actionNoun(group.action)} signal for ${group.providerName}.`,
        "",
        "Models in this signal:",
        ...formatModelList(events.map((event) => event.modelId)),
        "",
        "Events:",
        ...events.map(formatEventLine),
    ].join("\n");
}

function groupProviderIssueEntries(entries: ProviderIssueChangeEntry[]): ProviderIssueGroup[] {
    const grouped = new Map<string, ProviderIssueGroup>();

    for (const entry of entries) {
        const key = issueKeyForGroup(entry);
        const existing = grouped.get(key);
        if (existing) {
            existing.entries.push(entry);
            continue;
        }

        grouped.set(key, {
            key,
            action: entry.action,
            platformId: entry.platformId,
            platformName: entry.platformName,
            providerId: entry.providerId,
            providerName: entry.providerName,
            entries: [entry],
        });
    }

    return Array.from(grouped.values()).sort((left, right) => {
        const providerComparison = left.providerName.localeCompare(right.providerName);
        if (providerComparison !== 0) return providerComparison;
        return actionNoun(left.action).localeCompare(actionNoun(right.action));
    });
}

function resolveRunUrl(): string | null {
    const explicit = trimOrNull(process.env.MODEL_DISCOVERY_RUN_URL);
    if (explicit) return explicit;

    const serverUrl = trimOrNull(process.env.GITHUB_SERVER_URL) ?? "https://github.com";
    const repository = trimOrNull(process.env.GITHUB_REPOSITORY);
    const runId = trimOrNull(process.env.GITHUB_RUN_ID);
    if (!repository || !runId) return null;
    return `${serverUrl}/${repository}/actions/runs/${runId}`;
}

function createGitHubIssueClient(args: {
    token: string;
    repository: string;
    apiBaseUrl: string;
    requestImpl: typeof fetch;
}): GitHubIssueClient {
    const [owner, repo] = args.repository.split("/", 2);
    if (!owner || !repo) {
        throw new Error("GITHUB_REPOSITORY must be in owner/repo format.");
    }

    const apiBaseUrl = args.apiBaseUrl.replace(/\/+$/g, "");
    const requestJson = async <T>(pathName: string, init: RequestInit = {}): Promise<T> => {
        const response = await args.requestImpl(`${apiBaseUrl}${pathName}`, {
            ...init,
            headers: {
                Accept: "application/vnd.github+json",
                Authorization: `Bearer ${args.token}`,
                "Content-Type": "application/json",
                "X-GitHub-Api-Version": "2022-11-28",
                ...(init.headers ?? {}),
            },
        });

        if (response.status === 404) {
            throw new Error("GitHub resource not found");
        }

        if (!response.ok) {
            const body = await response.text().catch(() => "");
            throw new Error(`GitHub API failed with HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
        }

        if (response.status === 204) return undefined as T;
        return (await response.json()) as T;
    };

    return {
        async getIssue(issueNumber) {
            try {
                return await requestJson<GitHubIssue>(`/repos/${owner}/${repo}/issues/${issueNumber}`);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                if (message.includes("not found")) return null;
                throw error;
            }
        },
        async searchOpenIssue(query) {
            const response = await requestJson<GitHubSearchResponse>(`/search/issues?q=${encodeURIComponent(query)}&per_page=5`);
            return response.items?.find((issue) => issue.state === "open") ?? null;
        },
        async createIssue(input) {
            return await requestJson<GitHubIssue>(`/repos/${owner}/${repo}/issues`, {
                method: "POST",
                body: JSON.stringify(input),
            });
        },
        async updateIssue(issueNumber, input) {
            return await requestJson<GitHubIssue>(`/repos/${owner}/${repo}/issues/${issueNumber}`, {
                method: "PATCH",
                body: JSON.stringify(input),
            });
        },
        async createComment(issueNumber, body) {
            await requestJson(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
                method: "POST",
                body: JSON.stringify({ body }),
            });
        },
    };
}

async function findOpenIssue(args: {
    client: GitHubIssueClient;
    repository: string;
    key: string;
    existingRecord?: ProviderIssueRecord;
}): Promise<GitHubIssue | null> {
    const issueNumber = args.existingRecord?.issueNumber;
    if (typeof issueNumber === "number") {
        const issue = await args.client.getIssue(issueNumber);
        if (issue?.state === "open") return issue;
    }

    const marker = markerForKey(args.key);
    return await args.client.searchOpenIssue(`repo:${args.repository} is:issue is:open "${marker}"`);
}

export async function syncProviderChangeIssues(
    entries: ProviderIssueChangeEntry[],
    options: GitHubIssueSyncOptions
): Promise<{ created: number; updated: number; skipped: boolean }> {
    const token = trimOrNull(options.token ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN);
    const repository = trimOrNull(options.repository ?? process.env.GITHUB_REPOSITORY);
    const logger = options.logger ?? console;

    const filteredEntries = filterEntriesByKnownProviderModels(entries, options.knownModelIdsByProvider);
    if (filteredEntries.length === 0) {
        return { created: 0, updated: 0, skipped: false };
    }

    if (process.env.MODEL_DISCOVERY_GITHUB_ISSUES === "false") {
        logger.log("[model-discovery] GitHub issue sync disabled by MODEL_DISCOVERY_GITHUB_ISSUES=false.");
        return { created: 0, updated: 0, skipped: true };
    }

    if (!token || !repository) {
        logger.warn("[model-discovery] Skipping GitHub issue sync: GITHUB_TOKEN/GH_TOKEN or GITHUB_REPOSITORY is missing.");
        return { created: 0, updated: 0, skipped: true };
    }

    const client = createGitHubIssueClient({
        token,
        repository,
        apiBaseUrl: trimOrNull(options.apiBaseUrl ?? process.env.GITHUB_API_URL) ?? DEFAULT_GITHUB_API_BASE_URL,
        requestImpl: options.requestImpl ?? fetch,
    });
    const state = readIssueState(options.statePath);
    const timestamp = nowIso();
    const runUrl = trimOrNull(options.runUrl) ?? resolveRunUrl() ?? undefined;
    let created = 0;
    let updated = 0;

    for (const group of groupProviderIssueEntries(filteredEntries)) {
        const existingRecord = state.issues[group.key];
        const events: ProviderIssueHistoryEvent[] = group.entries.map((entry) => ({ ...entry, runUrl }));
        const recentEvents = [...events, ...(existingRecord?.recentEvents ?? [])].slice(0, MAX_RECENT_EVENTS);
        const body = buildIssueBody({ group, recentEvents });
        const title = issueTitleForGroup(group);
        const existingIssue = await findOpenIssue({ client, repository, key: group.key, existingRecord });

        if (existingIssue) {
            const issue = await client.updateIssue(existingIssue.number, { title, body });
            await client.createComment(issue.number, buildIssueComment(group, events));
            state.issues[group.key] = {
                issueNumber: issue.number,
                issueUrl: issue.html_url,
                recentEvents,
                updatedAt: timestamp,
            };
            state.updatedAt = timestamp;
            writeIssueState(options.statePath, state);
            updated += 1;
            continue;
        }

        const issue = await client.createIssue({ title, body });
        state.issues[group.key] = {
            issueNumber: issue.number,
            issueUrl: issue.html_url,
            recentEvents,
            updatedAt: timestamp,
        };
        state.updatedAt = timestamp;
        writeIssueState(options.statePath, state);
        created += 1;
    }

    state.updatedAt = timestamp;
    writeIssueState(options.statePath, state);

    return { created, updated, skipped: false };
}

export const testingExports = {
    buildIssueBody,
    buildIssueComment,
    filterEntriesByKnownProviderModels,
    groupProviderIssueEntries,
    issueKeyForGroup,
    issueTitleForGroup,
    markerForKey,
};
