import { readBindingEnv } from "./helpers";

export type UpstreamDiscoveryIssueSource = "provider-api" | "huggingface";
export type UpstreamDiscoveryIssueAction = "create" | "delete";

export type UpstreamDiscoveryIssueEntry = {
	source: UpstreamDiscoveryIssueSource;
	providerId: string;
	providerName: string;
	action: UpstreamDiscoveryIssueAction;
	modelId: string;
	detectedAt: string;
	detectionSource: string;
	modelUrl?: string | null;
	reason?: string | null;
};

type GitHubIssue = {
	number: number;
	html_url: string;
	state: string;
};

type GitHubSearchResponse = {
	items?: GitHubIssue[];
};

type GitHubIssueSyncSummary = {
	created: number;
	updated: number;
	skipped: boolean;
	reason?: string | null;
};

type GitHubIssueGroup = {
	key: string;
	source: UpstreamDiscoveryIssueSource;
	action: UpstreamDiscoveryIssueAction;
	providerId: string;
	providerName: string;
	entries: UpstreamDiscoveryIssueEntry[];
};

type GitHubIssueClient = {
	searchOpenIssue(query: string): Promise<GitHubIssue | null>;
	createIssue(input: { title: string; body: string }): Promise<GitHubIssue>;
	updateIssue(issueNumber: number, input: { title?: string; body?: string }): Promise<GitHubIssue>;
};

const DEFAULT_GITHUB_API_BASE_URL = "https://api.github.com";
const DEFAULT_GITHUB_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_GITHUB_REPOSITORY = "AI-Stats/AI-Stats";

function markerForKey(key: string): string {
	return `ai-stats-upstream-discovery:${key}`;
}

function issueKeyForGroup(input: Pick<GitHubIssueGroup, "source" | "providerId" | "action">): string {
	return btoa(`${input.source}\n${input.providerId.trim().toLowerCase()}\n${input.action}`)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

function actionNoun(action: UpstreamDiscoveryIssueAction): string {
	return action === "create" ? "additions" : "deletions";
}

function sourceLabel(source: UpstreamDiscoveryIssueSource): string {
	return source === "huggingface" ? "Hugging Face" : "provider API";
}

function formatDateTime(value: string): string {
	const parsed = new Date(value);
	if (!Number.isFinite(parsed.getTime())) return value;
	return parsed.toISOString();
}

function issueTitleForGroup(group: GitHubIssueGroup): string {
	if (group.source === "huggingface") {
		return `[upstream-discovery] Hugging Face: model ${actionNoun(group.action)} for ${group.providerName}`.slice(0, 250);
	}

	return `[upstream-discovery] ${group.providerName}: provider model ${actionNoun(group.action)}`.slice(0, 250);
}

function formatModelReference(entry: Pick<UpstreamDiscoveryIssueEntry, "modelId" | "modelUrl">): string {
	if (entry.modelUrl?.trim()) {
		return `\`${entry.modelId}\` (${entry.modelUrl.trim()})`;
	}
	return `\`${entry.modelId}\``;
}

function formatModelList(entries: UpstreamDiscoveryIssueEntry[]): string[] {
	return entries.map((entry) => `- ${formatModelReference(entry)}`);
}

function buildIssueBody(group: GitHubIssueGroup): string {
	const marker = markerForKey(group.key);
	const latest = group.entries[0];

	return [
		`<!-- ${marker} -->`,
		`Tracking key: \`${marker}\``,
		"",
		`The Cloudflare Worker model discovery cron detected ${sourceLabel(group.source)} model ${actionNoun(group.action)} for ${group.providerName}.`,
		"",
		"## Current signal",
		`- Source family: ${sourceLabel(group.source)}`,
		`- Provider/org: ${group.providerName} (\`${group.providerId}\`)`,
		`- Action: ${actionNoun(group.action)}`,
		`- Latest detected at: ${latest ? formatDateTime(latest.detectedAt) : "Unknown"}`,
		`- Detection source: \`${latest?.detectionSource ?? "unknown"}\``,
		`- Models in this signal: ${group.entries.length}`,
		"",
		"## Models in this signal",
		...formatModelList(group.entries),
		"",
		"## Triage notes",
		"- Check whether each upstream model should be added to AI Stats or mapped to an existing catalog entry.",
		"- Reuse this issue for repeated signals with the same source family, provider/org, and action type.",
		"- Close this issue once the upstream signal has been triaged.",
	].join("\n");
}

function groupIssueEntries(entries: UpstreamDiscoveryIssueEntry[]): GitHubIssueGroup[] {
	const grouped = new Map<string, GitHubIssueGroup>();

	for (const entry of entries) {
		const key = issueKeyForGroup({
			source: entry.source,
			providerId: entry.providerId,
			action: entry.action,
		});
		const existing = grouped.get(key);
		if (existing) {
			existing.entries.push(entry);
			continue;
		}
		grouped.set(key, {
			key,
			source: entry.source,
			action: entry.action,
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

function createGitHubIssueClient(args: {
	token: string;
	repository: string;
	requestImpl?: typeof fetch;
}): GitHubIssueClient {
	const [owner, repo] = args.repository.split("/", 2);
	if (!owner || !repo) {
		throw new Error("Configured GitHub repository must be in owner/repo format.");
	}

	const requestImpl = args.requestImpl ?? fetch;

	const requestJson = async <T>(pathName: string, init: RequestInit = {}): Promise<T> => {
		const response = await requestImpl(`${DEFAULT_GITHUB_API_BASE_URL}${pathName}`, {
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

		if (!response.ok) {
			const body = await response.text().catch(() => "");
			throw new Error(`GitHub API failed with HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
		}

		if (response.status === 204) return undefined as T;
		return (await response.json()) as T;
	};

	return {
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
	};
}

function shouldSkipIssueSync(entries: UpstreamDiscoveryIssueEntry[]): GitHubIssueSyncSummary | null {
	const token = readBindingEnv(["GITHUB_TOKEN", "GH_TOKEN"]);
	if (!token) {
		return {
			created: 0,
			updated: 0,
			skipped: true,
			reason: "missing GITHUB_TOKEN/GH_TOKEN",
		};
	}

	return null;
}

export function buildProviderIssueEntries(args: {
	changes: Array<{ providerId: string; providerName: string; added: string[]; removed: string[] }>;
	detectedAt: string;
	detectionSource: string;
}): UpstreamDiscoveryIssueEntry[] {
	const out: UpstreamDiscoveryIssueEntry[] = [];

	for (const change of args.changes) {
		for (const modelId of change.added) {
			out.push({
				source: "provider-api",
				providerId: change.providerId,
				providerName: change.providerName,
				action: "create",
				modelId,
				detectedAt: args.detectedAt,
				detectionSource: args.detectionSource,
			});
		}
		for (const modelId of change.removed) {
			out.push({
				source: "provider-api",
				providerId: change.providerId,
				providerName: change.providerName,
				action: "delete",
				modelId,
				detectedAt: args.detectedAt,
				detectionSource: args.detectionSource,
			});
		}
	}

	return out;
}

export async function syncUpstreamDiscoveryIssues(entries: UpstreamDiscoveryIssueEntry[]): Promise<GitHubIssueSyncSummary> {
	if (entries.length === 0) {
		return { created: 0, updated: 0, skipped: false, reason: "no entries" };
	}

	const skipped = shouldSkipIssueSync(entries);
	if (skipped) return skipped;

	const token = readBindingEnv(["GITHUB_TOKEN", "GH_TOKEN"])!.trim();
	const repository = DEFAULT_GITHUB_REPOSITORY;
	const client = createGitHubIssueClient({ token, repository });

	let created = 0;
	let updated = 0;
	for (const group of groupIssueEntries(entries)) {
		const marker = markerForKey(group.key);
		const existing = await client.searchOpenIssue(`repo:${repository} is:issue is:open "${marker}"`);
		const title = issueTitleForGroup(group);
		const body = buildIssueBody(group);

		if (existing) {
			await client.updateIssue(existing.number, { title, body });
			updated += 1;
			continue;
		}

		await client.createIssue({ title, body });
		created += 1;
	}

	return { created, updated, skipped: false };
}
