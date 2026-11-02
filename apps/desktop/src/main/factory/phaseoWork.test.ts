import { describe, expect, it } from "vitest";
import type { AgentProfile, PhaseoWorkSettings, Run, WorkItem } from "../../shared/factory/types";
import { PhaseoWorkClient, PhaseoWorkSource, type PhaseoWorkAccess } from "./phaseoWork";

type Call = { method: string; url: URL; headers: Record<string, string>; body?: Record<string, unknown> };

/** A fetch that records each call and answers from `answer`. */
function fakeFetch(answer: (call: Call) => { status?: number; body: unknown }) {
	const calls: Call[] = [];
	const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const call: Call = { method: init?.method ?? "GET", url: new URL(String(input)), headers: init?.headers as Record<string, string>, ...(init?.body ? { body: JSON.parse(String(init.body)) as Record<string, unknown> } : {}) };
		calls.push(call);
		const { status = 200, body } = answer(call);
		return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
	}) as typeof fetch;
	return { fetcher, calls };
}

const access = (token: string | null = "access-token"): PhaseoWorkAccess => ({ accounts: () => [{ id: "acct-1", name: "Dana", email: "dana@phaseo.app", workspaceId: "ws-1" }], token: async () => token });
const settings: PhaseoWorkSettings = { enabled: true, accountId: "acct-1", workspaceId: "ws-1", engineer: true, mine: true, label: "agent" };
const apiItem = (number: number, extra: Record<string, unknown> = {}) => ({ number, title: `Item ${number}`, description: "", state: "todo", priority: 1, labels: [], githubRepo: "acme/app", githubIssueNumber: null, triageSummary: null, createdAt: "2026-11-01T00:00:00Z", updatedAt: `2026-11-0${number}T00:00:00Z`, ...extra });
const agent = { id: "claude:default:opus", harness: "claude", label: "Opus 5.5", model: "claude-opus-5-5", billing: "subscription", connectionId: "claude:default" } as AgentProfile;

describe("PhaseoWorkClient", () => {
	it("reads open items with the sign-in's token, one query per rule, unioned", async () => {
		const { fetcher, calls } = fakeFetch((call) => ({ body: { items: call.url.searchParams.get("assignee") === "me" ? [apiItem(2), apiItem(1)] : [apiItem(1)], nextCursor: null } }));
		const records = await new PhaseoWorkClient(access(), fetcher).listItems(settings);
		expect(records.map((record) => record.number)).toEqual([2, 1]);
		expect(calls).toHaveLength(3);
		for (const call of calls) {
			expect(call.url.origin + call.url.pathname).toBe("https://phaseo.app/api/account/work/items");
			expect(call.headers.Authorization).toBe("Bearer access-token");
			expect(call.url.searchParams.get("workspaceId")).toBe("ws-1");
			expect(call.url.searchParams.get("state")).toBe("open");
		}
		expect(calls.map((call) => call.url.searchParams.get("assignee") ?? `label:${call.url.searchParams.get("label")}`)).toEqual(["engineer", "me", "label:agent"]);
	});

	it("never keeps an item's customer requests", async () => {
		const { fetcher } = fakeFetch(() => ({ body: { item: apiItem(4), requests: [{ body: "Refund me", contactEmail: "pat@example.com" }], events: [], runs: [] } }));
		const record = await new PhaseoWorkClient(access(), fetcher).item(settings, 4);
		expect(record?.number).toBe(4);
		expect(JSON.stringify(record)).not.toMatch(/Refund me|pat@example\.com/);
	});

	it("says what went wrong in its own words, and asks for a sign-in without one", async () => {
		const { fetcher } = fakeFetch(() => ({ status: 403, body: { error: "forbidden", message: "internal detail" } }));
		await expect(new PhaseoWorkClient(access(), fetcher).listItems(settings)).rejects.toThrow("This Phaseo sign-in can't use Phaseo Work in that workspace.");
		const none = fakeFetch(() => ({ body: {} }));
		await expect(new PhaseoWorkClient(access(null), none.fetcher).listItems(settings)).rejects.toThrow("Sign in to Phaseo");
		expect(none.calls).toHaveLength(0);
	});

	it("lists the sign-in's workspaces", async () => {
		const { fetcher, calls } = fakeFetch(() => ({ body: { workspaces: [{ id: "ws-1", name: "Phaseo", role: "owner" }, { name: "no id" }] } }));
		const source = new PhaseoWorkSource(new PhaseoWorkClient(access(), fetcher), () => settings);
		expect(await source.options()).toEqual({ accounts: access().accounts(), workspaces: [{ id: "ws-1", name: "Phaseo" }] });
		expect(calls[0]!.url.pathname).toBe("/api/account/auth/workspaces");
	});
});

describe("PhaseoWorkSource", () => {
	it("reads nothing while off or without a workspace", async () => {
		const { fetcher, calls } = fakeFetch(() => ({ body: { items: [apiItem(1)] } }));
		const client = new PhaseoWorkClient(access(), fetcher);
		expect(await new PhaseoWorkSource(client, () => undefined).poll()).toEqual([]);
		expect(await new PhaseoWorkSource(client, () => ({ ...settings, enabled: false })).poll()).toEqual([]);
		expect(await new PhaseoWorkSource(client, () => ({ ...settings, workspaceId: undefined })).poll()).toEqual([]);
		expect(calls).toHaveLength(0);
	});

	it("shares one read between checks that overlap, then reads again at the next", async () => {
		const { fetcher, calls } = fakeFetch(() => ({ body: { items: [apiItem(1)] } }));
		const source = new PhaseoWorkSource(new PhaseoWorkClient(access(), fetcher), () => ({ ...settings, mine: false, label: "" }));
		const [first, second] = await Promise.all([source.poll(), source.poll()]);
		expect(first).toBe(second);
		expect(first.map((item) => item.id)).toEqual(["acme/app#work-1"]);
		expect(calls).toHaveLength(1);
		await source.poll();
		expect(calls).toHaveLength(2);
	});

	it("reports a run's start, then its outcome and pull request on the same Phaseo run", async () => {
		const { fetcher, calls } = fakeFetch(() => ({ body: { run: { id: "wr-9" } } }));
		const source = new PhaseoWorkSource(new PhaseoWorkClient(access(), fetcher), () => settings);
		const [item] = await new PhaseoWorkSource(new PhaseoWorkClient(access(), fakeFetch(() => ({ body: { items: [apiItem(12)] } })).fetcher), () => ({ ...settings, mine: false, label: "" })).poll();
		const run: Run = { id: "run-1", itemId: item!.id, stage: "fix", agentId: agent.id, status: "running", startedAt: 0, log: [] };

		// The end waits for the start's answer, even when it comes first.
		const started = source.runStarted(item!, run, agent);
		const ended = source.runEnded(item!, { ...run, status: "succeeded", report: { summary: "Fixed it.\n```\nconst key = 'sk-live';\n```", verdict: "Fixed", notes: [], files: [] }, usage: { inputTokens: 10, outputTokens: 5, costUsd: 0.25 } });
		expect(await started).toBe("wr-9");
		await ended;
		await source.pullOpened(item!, { ...run, workRunId: "wr-9" }, "https://github.com/acme/app/pull/77");

		expect(calls.map((call) => `${call.method} ${call.url.pathname}`)).toEqual(["POST /api/account/work/items/12/runs", "PATCH /api/account/work/runs/wr-9", "PATCH /api/account/work/runs/wr-9"]);
		expect(calls[0]!.body).toEqual({ workspaceId: "ws-1", agent: "engineer", runner: "desktop", status: "running", model: "claude-opus-5-5", summary: "Fix started in Phaseo Factory" });
		expect(calls[1]!.body).toEqual({ workspaceId: "ws-1", status: "succeeded", summary: "Fix (Fixed): Fixed it.", costNanos: 250_000_000 });
		expect(calls[2]!.body).toEqual({ workspaceId: "ws-1", externalUrl: "https://github.com/acme/app/pull/77" });
		for (const call of calls) expect(call.headers.Authorization).toBe("Bearer access-token");
	});

	it("reports nothing for items that aren't from Phaseo Work, or whose start wasn't recorded", async () => {
		const { fetcher, calls } = fakeFetch(() => ({ status: 500, body: {} }));
		const source = new PhaseoWorkSource(new PhaseoWorkClient(access(), fetcher), () => settings);
		const github = { id: "acme/app#5", source: "github" } as WorkItem;
		const run: Run = { id: "run-2", itemId: github.id, stage: "fix", agentId: agent.id, status: "running", startedAt: 0, log: [] };
		expect(await source.runStarted(github, run, agent)).toBeUndefined();
		await source.runEnded(github, run);
		expect(calls).toHaveLength(0);

		const item = { ...github, phaseo: { workspaceId: "ws-1", number: 5, url: "https://phaseo.app/work/5", state: "todo", priority: 0 } } as WorkItem;
		await expect(source.runStarted(item, run, agent)).rejects.toThrow("HTTP 500");
		await source.runEnded(item, { ...run, status: "failed" });
		expect(calls).toHaveLength(1);
	});
});
