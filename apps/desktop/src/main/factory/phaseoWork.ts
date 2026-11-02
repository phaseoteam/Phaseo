import { PHASEO_WEB, costNanos, readWorkDetail, readWorkList, toFactoryItem, unionRecords, workQueries, workRunSummary, type WorkRecord } from "../../shared/factory/phaseoWork";
import { stageLabel } from "../../shared/factory/stages";
import type { AgentProfile, PhaseoWorkOptions, PhaseoWorkSettings, Run, WorkItem } from "../../shared/factory/types";

/**
 * Phaseo Work in the main process: reading the workspace's items with the desktop's Phaseo sign-in, and reporting
 * Factory's runs on them back as agent runs. The sign-in's access token is fetched for each call and never leaves
 * this process. Customer requests are never asked for, and every answer is read through the allowlist in
 * shared/factory/phaseoWork.ts.
 */

/** The desktop's Phaseo sign-ins, as Factory may use them. */
export interface PhaseoWorkAccess {
	accounts(): PhaseoWorkOptions["accounts"];
	/** A current access token for the sign-in (the first one when unset), or null when there's none. */
	token(accountId?: string): Promise<string | null>;
}

const MAX_RESPONSE = 4 * 1024 * 1024;
const LIST_LIMIT = 100;

export class PhaseoWorkError extends Error {
	constructor(message: string, readonly status: number) {
		super(message);
	}
}

/** The account API's work routes, `/api/account/work/...`, and the workspace list. */
export class PhaseoWorkClient {
	constructor(private readonly access: PhaseoWorkAccess, private readonly fetcher: typeof fetch = fetch, private readonly origin = PHASEO_WEB) {}

	accounts() {
		return this.access.accounts();
	}

	private async request(accountId: string | undefined, method: "GET" | "POST" | "PATCH", route: string, query?: Record<string, string>, body?: Record<string, unknown>): Promise<unknown> {
		const token = await this.access.token(accountId);
		if (!token) throw new PhaseoWorkError("Sign in to Phaseo in Settings → Accounts first.", 401);
		const url = new URL(route, this.origin);
		for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
		const response = await this.fetcher(url, {
			method, redirect: "error", signal: AbortSignal.timeout(20_000),
			headers: { Authorization: `Bearer ${token}`, accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
			...(body ? { body: JSON.stringify(body) } : {}),
		});
		const text = await boundedText(response);
		if (!response.ok) throw new PhaseoWorkError(failure(response.status), response.status);
		try {
			return text ? JSON.parse(text) as unknown : {};
		} catch {
			throw new PhaseoWorkError("Phaseo Work sent an answer Factory couldn't read.", response.status);
		}
	}

	/** The workspaces the sign-in belongs to. */
	async workspaces(accountId?: string): Promise<{ id: string; name: string }[]> {
		const body = await this.request(accountId, "GET", "/api/account/auth/workspaces") as { workspaces?: unknown };
		const list = Array.isArray(body.workspaces) ? body.workspaces : [];
		return list.flatMap((entry) => {
			const value = entry as { id?: unknown; name?: unknown };
			return typeof value.id === "string" && value.id ? [{ id: value.id, name: typeof value.name === "string" && value.name ? value.name.slice(0, 200) : value.id }] : [];
		});
	}

	/** Open items the rule takes: one query per part of it, unioned. */
	async listItems(settings: PhaseoWorkSettings): Promise<WorkRecord[]> {
		const workspaceId = settings.workspaceId;
		if (!workspaceId) return [];
		const lists = await Promise.all(workQueries(settings).map(async (filter) => readWorkList(await this.request(settings.accountId, "GET", "/api/account/work/items", { workspaceId, state: "open", limit: String(LIST_LIMIT), ...filter }))));
		return unionRecords(lists);
	}

	/** One item, without its customer requests: only `item` is read from the answer. */
	async item(settings: PhaseoWorkSettings, number: number): Promise<WorkRecord | null> {
		if (!settings.workspaceId) return null;
		return readWorkDetail(await this.request(settings.accountId, "GET", `/api/account/work/items/${number}`, { workspaceId: settings.workspaceId }));
	}

	async startRun(accountId: string | undefined, workspaceId: string, number: number, body: { status: "running"; model?: string; summary?: string }): Promise<string | undefined> {
		const answer = await this.request(accountId, "POST", `/api/account/work/items/${number}/runs`, undefined, { workspaceId, agent: "engineer", runner: "desktop", ...body }) as { run?: { id?: unknown } };
		return typeof answer.run?.id === "string" ? answer.run.id : undefined;
	}

	async updateRun(accountId: string | undefined, workspaceId: string, runId: string, body: { status?: string; summary?: string; externalUrl?: string; costNanos?: number; model?: string }): Promise<void> {
		await this.request(accountId, "PATCH", `/api/account/work/runs/${encodeURIComponent(runId)}`, undefined, { workspaceId, ...body });
	}
}

/**
 * Phaseo Work as Factory's source: what Factory reads on its own schedule (with GitHub, every few minutes, when the
 * window comes back into focus and on Check now), and where its runs on Phaseo items are reported.
 */
export class PhaseoWorkSource {
	private inflight?: Promise<WorkItem[]>;
	/** Runs whose start is being reported, so their end waits for the Phaseo run's id. */
	private starting = new Map<string, Promise<string | undefined>>();

	constructor(private readonly client: PhaseoWorkClient, private readonly settings: () => PhaseoWorkSettings | undefined) {}

	/** Open items the rule takes, as Factory items. Off, or without a workspace, there are none. Calls at once share one read. */
	poll(): Promise<WorkItem[]> {
		const settings = this.settings();
		if (!settings?.enabled || !settings.workspaceId) return Promise.resolve([]);
		const workspaceId = settings.workspaceId;
		this.inflight ??= this.client.listItems(settings).then((records) => records.map((record) => toFactoryItem(record, workspaceId))).finally(() => { this.inflight = undefined; });
		return this.inflight;
	}

	async options(accountId?: string): Promise<PhaseoWorkOptions> {
		const accounts = this.client.accounts();
		if (!accounts.length) return { accounts, workspaces: [], error: "Sign in to Phaseo in Settings → Accounts first." };
		try {
			return { accounts, workspaces: await this.client.workspaces(accountId ?? accounts[0]!.id) };
		} catch (error) {
			return { accounts, workspaces: [], error: error instanceof Error ? error.message : String(error) };
		}
	}

	/** A stage started on a Phaseo item: reported as the engineer agent running on this desktop. Returns the Phaseo run's id. */
	runStarted(item: WorkItem, run: Run, agent: AgentProfile): Promise<string | undefined> {
		if (!item.phaseo) return Promise.resolve(undefined);
		const started = this.client.startRun(this.settings()?.accountId, item.phaseo.workspaceId, item.phaseo.number, { status: "running", ...(agent.model ? { model: agent.model } : {}), summary: `${stageLabel(run.stage)} started in Phaseo Factory` });
		this.starting.set(run.id, started.catch(() => undefined));
		return started;
	}

	/** A stage ended: its outcome, the report's summary (no file contents) and what it cost. */
	async runEnded(item: WorkItem, run: Run): Promise<void> {
		if (!item.phaseo) return;
		const id = run.workRunId ?? await this.starting.get(run.id);
		// By now the store has the id on the run itself.
		this.starting.delete(run.id);
		if (!id) return;
		const summary = workRunSummary(run), cost = costNanos(run);
		await this.client.updateRun(this.settings()?.accountId, item.phaseo.workspaceId, id, { status: run.status, ...(summary ? { summary } : {}), ...(cost !== undefined ? { costNanos: cost } : {}) });
	}

	/** Factory opened a pull request for the item: it goes on the run that wrote the fix. */
	async pullOpened(item: WorkItem, run: Run | undefined, url: string): Promise<void> {
		if (!item.phaseo || !run) return;
		const id = run.workRunId ?? await this.starting.get(run.id);
		if (!id) return;
		await this.client.updateRun(this.settings()?.accountId, item.phaseo.workspaceId, id, { externalUrl: url });
	}
}

/** What went wrong, in words for Settings; the server's own text never reaches the window. */
function failure(status: number): string {
	if (status === 401) return "Your Phaseo login has ended. Sign in again in Settings → Accounts.";
	if (status === 403) return "This Phaseo sign-in can't use Phaseo Work in that workspace.";
	if (status === 404) return "Phaseo Work isn't available on this server yet.";
	if (status === 429) return "Phaseo is busy. Factory tries again at the next check.";
	return `Phaseo Work answered HTTP ${status}. Factory tries again at the next check.`;
}

async function boundedText(response: Response): Promise<string> {
	const reader = response.body?.getReader();
	if (!reader) return "";
	const chunks: Uint8Array[] = [];
	let bytes = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			bytes += value.byteLength;
			if (bytes > MAX_RESPONSE) {
				await reader.cancel();
				throw new PhaseoWorkError("Phaseo Work sent too much at once.", response.status);
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}
	return Buffer.concat(chunks).toString("utf8");
}
