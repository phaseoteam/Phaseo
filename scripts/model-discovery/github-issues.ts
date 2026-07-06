import fs from "node:fs";
import path from "node:path";

export type UpstreamDiscoveryIssueSource = "provider-api" | "huggingface";

export type UpstreamDiscoveryIssueAction = "create" | "update" | "delete";

export type UpstreamDiscoveryIssueEntry = {
    source: UpstreamDiscoveryIssueSource;
    ts: string;
    action: UpstreamDiscoveryIssueAction;
    platformId: string;
    platformName: string;
    providerId: string;
    providerName: string;
    modelId: string;
    modelUrl?: string;
    reason?: string;
    metadata?: Record<string, unknown>;
};

export type ProviderIssueChangeAction = UpstreamDiscoveryIssueAction;
export type ProviderIssueChangeEntry = Omit<UpstreamDiscoveryIssueEntry, "source"> & {
    source?: UpstreamDiscoveryIssueSource;
};

type UpstreamIssueHistoryEvent = UpstreamDiscoveryIssueEntry & {
    runUrl?: string;
};

type UpstreamIssueRecord = {
    issueNumber?: number;
    issueUrl?: string;
    recentEvents: UpstreamIssueHistoryEvent[];
    updatedAt: string;
};

type UpstreamIssueState = {
    version: 1;
    updatedAt: string;
    issues: Record<string, UpstreamIssueRecord>;
};

type GitHubIssue = {
    number: number;
    html_url: string;
    state: string;
    title?: string;
    body?: string;
    labels?: Array<string | { name?: string | null }>;
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
    logger?: Pick<Console, "log" | "warn">;
    requestImpl?: typeof fetch;
};

type GitHubIssueClient = {
    getIssue(issueNumber: number): Promise<GitHubIssue | null>;
    searchOpenIssue(query: string): Promise<GitHubIssue | null>;
    createIssue(input: { title: string; body: string; labels?: string[] }): Promise<GitHubIssue>;
    updateIssue(issueNumber: number, input: { title?: string; body?: string; labels?: string[] }): Promise<GitHubIssue>;
    createComment(issueNumber: number, body: string): Promise<void>;
};

const MAX_RECENT_EVENTS = 20;
const DEFAULT_GITHUB_API_BASE_URL = "https://api.github.com";
const DEFAULT_GITHUB_REQUEST_TIMEOUT_MS = 30_000;
const MANAGED_ISSUE_LABEL = "ai-stats-upstream-discovery";

function nowIso(): string {
    return new Date().toISOString();
}

function trimOrNull(value: string | null | undefined): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed || null;
}

function normalizeEntry(entry: ProviderIssueChangeEntry | UpstreamDiscoveryIssueEntry): UpstreamDiscoveryIssueEntry {
    return {
        ...entry,
        source: entry.source ?? "provider-api",
    };
}

function readIssueState(filePath: string): UpstreamIssueState {
    if (!fs.existsSync(filePath)) {
        return {
            version: 1,
            updatedAt: nowIso(),
            issues: {},
        };
    }

    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Partial<UpstreamIssueState> | undefined;
        if (!parsed || parsed.version !== 1 || !parsed.issues || typeof parsed.issues !== "object") {
            throw new Error("Invalid issue state");
        }

        return {
            version: 1,
            updatedAt: trimOrNull(parsed.updatedAt) ?? nowIso(),
            issues: Object.fromEntries(
                Object.entries(parsed.issues).map(([key, record]) => {
                    const recentEvents = Array.isArray(record?.recentEvents)
                        ? record.recentEvents.filter(isUpstreamIssueHistoryEvent).slice(0, MAX_RECENT_EVENTS)
                        : [];
                    return [
                        key,
                        {
                            issueNumber: typeof record?.issueNumber === "number" ? record.issueNumber : undefined,
                            issueUrl: trimOrNull(record?.issueUrl) ?? undefined,
                            recentEvents,
                            updatedAt: trimOrNull(record?.updatedAt) ?? nowIso(),
                        } satisfies UpstreamIssueRecord,
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

function writeIssueState(filePath: string, state: UpstreamIssueState): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

function isUpstreamIssueHistoryEvent(value: unknown): value is UpstreamIssueHistoryEvent {
    if (!value || typeof value !== "object") return false;
    const row = value as Partial<UpstreamIssueHistoryEvent>;
    return (
        (row.source === "provider-api" || row.source === "huggingface") &&
        typeof row.ts === "string" &&
        (row.action === "create" || row.action === "update" || row.action === "delete") &&
        typeof row.platformId === "string" &&
        typeof row.platformName === "string" &&
        typeof row.providerId === "string" &&
        typeof row.providerName === "string" &&
        typeof row.modelId === "string"
    );
}

type UpstreamIssueGroup = {
    key: string;
    source: UpstreamDiscoveryIssueSource;
    action: UpstreamDiscoveryIssueAction;
    platformId: string;
    platformName: string;
    providerId: string;
    providerName: string;
    entries: UpstreamDiscoveryIssueEntry[];
};

function issueKeyForGroup(input: Pick<UpstreamDiscoveryIssueEntry, "source" | "providerId" | "action">): string {
    return Buffer.from(`${input.source}\n${input.providerId.trim().toLowerCase()}\n${input.action}`).toString("base64url");
}

function markerForKey(key: string): string {
    return `ai-stats-upstream-discovery:${key}`;
}

function legacyProviderIssueKeyForGroup(input: Pick<UpstreamDiscoveryIssueEntry, "providerId" | "action">): string {
    return Buffer.from(`${input.providerId.trim().toLowerCase()}
${input.action}`).toString("base64url");
}

function legacyMarkerForKey(key: string): string {
    return `ai-stats-model-discovery:${key}`;
}

function actionNoun(action: UpstreamDiscoveryIssueAction): string {
    if (action === "create") return "additions";
    if (action === "delete") return "deletions";
    return "changes";
}

function actionVerb(action: UpstreamDiscoveryIssueAction): string {
    if (action === "create") return "added";
    if (action === "delete") return "removed";
    return "changed";
}

function sourceLabel(source: UpstreamDiscoveryIssueSource): string {
    if (source === "huggingface") return "Hugging Face";
    return "provider API";
}

function issueTitleForGroup(group: UpstreamIssueGroup): string {
    if (group.source === "huggingface") {
        return `[upstream-discovery] Hugging Face: model ${actionNoun(group.action)} for ${group.providerName}`.slice(0, 250);
    }

    return `[upstream-discovery] ${group.providerName}: provider model ${actionNoun(group.action)}`.slice(0, 250);
}

function hasManagedIssueLabel(issue: Pick<GitHubIssue, "labels">): boolean {
    return (
        issue.labels?.some((label) =>
            typeof label === "string"
                ? label === MANAGED_ISSUE_LABEL
                : trimOrNull(label?.name) === MANAGED_ISSUE_LABEL
        ) ?? false
    );
}

function issueContainsAnyMarker(issue: Pick<GitHubIssue, "title" | "body">, markers: string[]): boolean {
    const haystacks = [issue.body ?? "", issue.title ?? ""];
    return markers.some((marker) => haystacks.some((value) => value.includes(marker)));
}

function mergeManagedIssueLabels(issue: Pick<GitHubIssue, "labels">): string[] {
    const labels = new Set<string>();
    for (const label of issue.labels ?? []) {
        const normalized = trimOrNull(typeof label === "string" ? label : label?.name);
        if (normalized) labels.add(normalized);
    }
    labels.add(MANAGED_ISSUE_LABEL);
    return Array.from(labels);
}

function isTrustedManagedIssue(issue: GitHubIssue | null, markers: string[]): issue is GitHubIssue {
    return !!issue && issue.state === "open" && hasManagedIssueLabel(issue) && issueContainsAnyMarker(issue, markers);
}

function formatDateTime(value: string): string {
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.getTime())) return value;
    return parsed.toISOString();
}

function formatModelLink(event: Pick<UpstreamDiscoveryIssueEntry, "modelId" | "modelUrl">): string {
    if (event.modelUrl) return `\`${event.modelId}\` (${event.modelUrl})`;
    return `\`${event.modelId}\``;
}

function formatEventLine(event: UpstreamIssueHistoryEvent): string {
    const runSuffix = event.runUrl ? ` ([workflow run](${event.runUrl}))` : "";
    const reasonSuffix = event.reason ? ` — ${event.reason}` : "";
    return `- ${formatDateTime(event.ts)}: ${actionVerb(event.action)} ${formatModelLink(event)} from ${sourceLabel(event.source)} ${event.providerName} (${event.providerId})${reasonSuffix}${runSuffix}`;
}

function formatModelList(entries: UpstreamDiscoveryIssueEntry[]): string[] {
    return entries.map((entry) => `- ${formatModelLink(entry)}`);
}

function buildIssueBody(args: {
    group: UpstreamIssueGroup;
    recentEvents: UpstreamIssueHistoryEvent[];
}): string {
    const { group, recentEvents } = args;
    const marker = markerForKey(group.key);
    const latestEvent = recentEvents[0] ?? group.entries[0];
    const eventLines = recentEvents.length > 0 ? recentEvents.map(formatEventLine) : group.entries.map(formatEventLine);

    return [
        `<!-- ${marker} -->`,
        `Tracking key: \`${marker}\``,
        "",
        `The upstream discovery bot detected ${sourceLabel(group.source)} model ${actionNoun(group.action)} for ${group.providerName}.`,
        "",
        "## Current signal",
        `- Source: ${sourceLabel(group.source)}`,
        `- Platform: ${group.platformName} (\`${group.platformId}\`)`,
        `- Provider/org: ${group.providerName} (\`${group.providerId}\`)`,
        `- Latest action: ${actionNoun(group.action)}`,
        `- Latest detected at: ${latestEvent ? formatDateTime(latestEvent.ts) : "Unknown"}`,
        `- Models in this signal: ${group.entries.length}`,
        "",
        "## Models in this signal",
        ...formatModelList(group.entries),
        "",
        "## Recent detections",
        ...eventLines,
        "",
        "## Workflow run",
        latestEvent?.runUrl ? `- ${latestEvent.runUrl}` : "- Not available",
        "",
        "## Triage notes",
        "- Check whether each upstream model should be added to Phaseo or mapped to an existing catalog entry.",
        "- Reuse this issue for repeated signals with the same source, provider/org, and action type.",
        "- Close this issue once the upstream signal has been triaged.",
    ].join("\n");
}

function buildIssueComment(group: UpstreamIssueGroup, events: UpstreamIssueHistoryEvent[]): string {
    return [
        `Upstream discovery detected another ${sourceLabel(group.source)} ${actionNoun(group.action)} signal for ${group.providerName}.`,
        "",
        "Models in this signal:",
        ...formatModelList(events),
        "",
        "Events:",
        ...events.map(formatEventLine),
    ].join("\n");
}

function groupUpstreamIssueEntries(entries: UpstreamDiscoveryIssueEntry[]): UpstreamIssueGroup[] {
    const grouped = new Map<string, UpstreamIssueGroup>();

    for (const entry of entries) {
        const key = issueKeyForGroup(entry);
        const existing = grouped.get(key);
        if (existing) {
            existing.entries.push(entry);
            continue;
        }

        grouped.set(key, {
            key,
            source: entry.source,
            action: entry.action,
            platformId: entry.platformId,
            platformName: entry.platformName,
            providerId: entry.providerId,
            providerName: entry.providerName,
            entries: [entry],
        });
    }

    return Array.from(grouped.values()).sort((left, right) => {
        const sourceComparison = sourceLabel(left.source).localeCompare(sourceLabel(right.source));
        if (sourceComparison !== 0) return sourceComparison;
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
            signal: init.signal ?? AbortSignal.timeout(DEFAULT_GITHUB_REQUEST_TIMEOUT_MS),
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
    legacyKey?: string;
    existingRecord?: UpstreamIssueRecord;
}): Promise<GitHubIssue | null> {
    const markers = [markerForKey(args.key)];
    if (args.legacyKey) {
        markers.push(legacyMarkerForKey(args.legacyKey));
    }

    const issueNumber = args.existingRecord?.issueNumber;
    if (typeof issueNumber === "number") {
        const issue = await args.client.getIssue(issueNumber);
        if (isTrustedManagedIssue(issue, markers)) return issue;
    }

    const marker = markers[0]!;
    const currentCandidate = await args.client.searchOpenIssue(
        `repo:${args.repository} is:issue is:open in:body label:${MANAGED_ISSUE_LABEL} "${marker}"`
    );
    const currentIssue = currentCandidate ? await args.client.getIssue(currentCandidate.number) : null;
    if (isTrustedManagedIssue(currentIssue, [marker])) return currentIssue;

    if (args.legacyKey) {
        const legacyMarker = legacyMarkerForKey(args.legacyKey);
        const legacyCandidate = await args.client.searchOpenIssue(
            `repo:${args.repository} is:issue is:open in:body label:${MANAGED_ISSUE_LABEL} "${legacyMarker}"`
        );
        const legacyIssue = legacyCandidate ? await args.client.getIssue(legacyCandidate.number) : null;
        if (isTrustedManagedIssue(legacyIssue, [legacyMarker])) return legacyIssue;
    }

    return null;
}

function shouldSkipForEnv(source: UpstreamDiscoveryIssueSource, logger: Pick<Console, "log">): boolean {
    if (source === "provider-api" && process.env.MODEL_DISCOVERY_PROVIDER_GITHUB_ISSUES === "false") {
        logger.log("[model-discovery] Provider API GitHub issue sync disabled by MODEL_DISCOVERY_PROVIDER_GITHUB_ISSUES=false.");
        return true;
    }

    if (source === "huggingface") {
        if (process.env.MODEL_DISCOVERY_HF_GITHUB_ISSUES !== "true") {
            logger.log(
                "[model-discovery] Hugging Face GitHub issue sync disabled unless MODEL_DISCOVERY_HF_GITHUB_ISSUES=true."
            );
            return true;
        }
    }

    return false;
}

function filterEntriesForEnabledSources(
    entries: UpstreamDiscoveryIssueEntry[],
    logger: Pick<Console, "log">
): UpstreamDiscoveryIssueEntry[] {
    const disabledSources = new Set<UpstreamDiscoveryIssueSource>();
    const activeSources = new Set(entries.map((entry) => entry.source));

    for (const source of activeSources) {
        if (shouldSkipForEnv(source, logger)) {
            disabledSources.add(source);
        }
    }

    if (disabledSources.size === 0) return entries;
    return entries.filter((entry) => !disabledSources.has(entry.source));
}

function logSyncSummary(args: {
    logger: Pick<Console, "log">;
    source: UpstreamDiscoveryIssueSource | "mixed";
    inputEvents: number;
    filteredEvents: number;
    created: number;
    updated: number;
    skipped: boolean;
    reason?: string;
}): void {
    const reason = args.reason ? ` reason=${JSON.stringify(args.reason)}` : "";
    args.logger.log(
        `[model-discovery] upstream issue sync: source=${args.source} inputEvents=${args.inputEvents} filteredEvents=${args.filteredEvents} created=${args.created} updated=${args.updated} skipped=${args.skipped}${reason}`
    );
}

export async function syncUpstreamDiscoveryIssues(
    rawEntries: UpstreamDiscoveryIssueEntry[],
    options: GitHubIssueSyncOptions
): Promise<{ created: number; updated: number; skipped: boolean }> {
    const logger = options.logger ?? console;
    const entries = rawEntries.map(normalizeEntry);
    const sources = Array.from(new Set(entries.map((entry) => entry.source)));
    const sourceForLog = sources.length === 1 ? sources[0] : "mixed";

    if (entries.length === 0) {
        logSyncSummary({
            logger,
            source: sourceForLog ?? "mixed",
            inputEvents: rawEntries.length,
            filteredEvents: 0,
            created: 0,
            updated: 0,
            skipped: false,
            reason: "no entries",
        });
        return { created: 0, updated: 0, skipped: false };
    }

    if (process.env.MODEL_DISCOVERY_GITHUB_ISSUES === "false") {
        logger.log("[model-discovery] GitHub issue sync disabled by MODEL_DISCOVERY_GITHUB_ISSUES=false.");
        logSyncSummary({
            logger,
            source: sourceForLog,
            inputEvents: rawEntries.length,
            filteredEvents: 0,
            created: 0,
            updated: 0,
            skipped: true,
            reason: "disabled by MODEL_DISCOVERY_GITHUB_ISSUES",
        });
        return { created: 0, updated: 0, skipped: true };
    }

    const filteredEntries = filterEntriesForEnabledSources(entries, logger);

    if (filteredEntries.length === 0) {
        logSyncSummary({
            logger,
            source: sourceForLog,
            inputEvents: rawEntries.length,
            filteredEvents: filteredEntries.length,
            created: 0,
            updated: 0,
            skipped: true,
            reason: "all entries disabled by environment",
        });
        return { created: 0, updated: 0, skipped: true };
    }

    const token = trimOrNull(options.token ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN);
    const repository = trimOrNull(options.repository ?? process.env.GITHUB_REPOSITORY);
    if (!token || !repository) {
        logger.warn("[model-discovery] Skipping GitHub issue sync: GITHUB_TOKEN/GH_TOKEN or GITHUB_REPOSITORY is missing.");
        logSyncSummary({
            logger,
            source: sourceForLog,
            inputEvents: rawEntries.length,
            filteredEvents: filteredEntries.length,
            created: 0,
            updated: 0,
            skipped: true,
            reason: "missing GitHub token or repository",
        });
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

    for (const group of groupUpstreamIssueEntries(filteredEntries)) {
        const legacyKey = group.source === "provider-api" ? legacyProviderIssueKeyForGroup(group) : undefined;
        const existingRecord = state.issues[group.key] ?? (legacyKey ? state.issues[legacyKey] : undefined);
        const events: UpstreamIssueHistoryEvent[] = group.entries.map((entry) => ({ ...entry, runUrl }));
        const recentEvents = [...events, ...(existingRecord?.recentEvents ?? [])].slice(0, MAX_RECENT_EVENTS);
        const body = buildIssueBody({ group, recentEvents });
        const title = issueTitleForGroup(group);
        const existingIssue = await findOpenIssue({ client, repository, key: group.key, legacyKey, existingRecord });

        if (existingIssue) {
            const issue = await client.updateIssue(existingIssue.number, {
                title,
                body,
                labels: mergeManagedIssueLabels(existingIssue),
            });
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

        const issue = await client.createIssue({ title, body, labels: [MANAGED_ISSUE_LABEL] });
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

    logSyncSummary({
        logger,
        source: sourceForLog,
        inputEvents: rawEntries.length,
        filteredEvents: filteredEntries.length,
        created,
        updated,
        skipped: false,
    });

    return { created, updated, skipped: false };
}

export async function syncProviderChangeIssues(
    entries: ProviderIssueChangeEntry[],
    options: GitHubIssueSyncOptions & { knownModelIdsByProvider?: Map<string, Set<string>> }
): Promise<{ created: number; updated: number; skipped: boolean }> {
    if (options.knownModelIdsByProvider) {
        entries = entries.filter((entry) => {
            const normalized = normalizeEntry(entry);
            if (normalized.source !== "provider-api") return true;
            const allowlist = options.knownModelIdsByProvider?.get(normalized.providerId);
            return allowlist?.has(normalized.modelId) ?? false;
        });
    }

    return await syncUpstreamDiscoveryIssues(entries.map(normalizeEntry), options);
}

export const testingExports = {
    buildIssueBody,
    buildIssueComment,
    groupUpstreamIssueEntries,
    hasManagedIssueLabel,
    isTrustedManagedIssue,
    issueKeyForGroup,
    issueTitleForGroup,
    legacyMarkerForKey,
    legacyProviderIssueKeyForGroup,
    markerForKey,
};
