import { describe, expect, it } from "vitest";
import { fakeDataClient, hasFilter, type FakeQuery } from "./fakeDataClient.testing";
import { githubLabels, handleBridgeEvent, linkedIssueNumbers, parseBridgePayload } from "./githubBridge";
import type { WorkItemRow } from "./types";

const WORKSPACE = "11111111-1111-1111-1111-111111111111";
const link = { id: "repo-1", workspace_id: WORKSPACE, repo: "acme/shop", sync_issues: true };

function itemRow(overrides: Partial<WorkItemRow> = {}): WorkItemRow {
	return {
		id: "item-1",
		workspace_id: WORKSPACE,
		number: 3,
		title: "Checkout breaks",
		description: "Written in Phaseo",
		state: "todo",
		priority: 2,
		source: "manual",
		labels: ["bug"],
		assignee_user_id: null,
		assignee_agent: null,
		duplicate_of: null,
		error_group_id: null,
		github_repo: "acme/shop",
		github_issue_number: 12,
		github_issue_url: "https://github.com/acme/shop/issues/12",
		github_pr_url: null,
		triage_summary: null,
		due_at: null,
		created_by: null,
		created_at: "2026-11-01T00:00:00Z",
		updated_at: "2026-11-01T00:00:00Z",
		closed_at: null,
		...overrides,
	};
}

/** A fake where the issue lookup finds `item` (or nothing) and updates echo the patched row. */
function setup(item: WorkItemRow | null, extra: (query: FakeQuery) => { data: unknown; error: null } | undefined = () => undefined) {
	let current = item;
	const fake = fakeDataClient((query) => {
		const handled = extra(query);
		if (handled) return handled;
		if (query.table === "work_items" && query.op === "select") return { data: current, error: null };
		if (query.table === "work_items" && query.op === "update") {
			current = { ...(current as WorkItemRow), ...(query.payload as Partial<WorkItemRow>) };
			return { data: current, error: null };
		}
		return undefined;
	});
	fake.onRpc((_name, args) => ({ data: itemRow({ id: "item-new", source: "github", title: String(args.p_title) }), error: null }));
	const updates = () => fake.queries.filter((query) => query.table === "work_items" && query.op === "update").map((query) => query.payload as Record<string, unknown>);
	const events = () => fake.queries.filter((query) => query.table === "work_item_events").flatMap((query) => [query.payload].flat() as Array<Record<string, unknown>>);
	return { fake, updates, events };
}

const issuePayload = (action: string, issue: Record<string, unknown> = {}) => parseBridgePayload({
	event: "issues",
	action,
	repo: "acme/shop",
	issue: { number: 12, title: "Checkout breaks on Safari", body: "Steps...", state: "open", html_url: "https://github.com/acme/shop/issues/12", user: "octo", labels: ["Bug", "Needs Triage"], ...issue },
})!;

describe("parseBridgePayload", () => {
	it("accepts the workflow's events and rejects anything else", () => {
		expect(issuePayload("opened")).toMatchObject({ event: "issues", action: "opened", issue: { number: 12, user: "octo", labels: ["Bug", "Needs Triage"] } });
		expect(parseBridgePayload({ event: "push", repo: "acme/shop" })).toBeNull();
		expect(parseBridgePayload({ event: "issues", repo: "acme/shop", issue: { number: -1 } })).toBeNull();
		expect(parseBridgePayload({ event: "agent_run", repo: "acme/shop", issue: { number: 1 }, run: { status: "exploded" } })).toBeNull();
		expect(parseBridgePayload([])).toBeNull();
	});

	it("only keeps GitHub links", () => {
		const payload = parseBridgePayload({ event: "pull_request", action: "opened", repo: "acme/shop", pull_request: { number: 5, title: "x", html_url: "javascript:alert(1)", body: "" } })!;
		expect(payload.pull_request?.html_url).toBeNull();
	});
});

describe("linkedIssueNumbers", () => {
	it("finds closing keywords first, mentions after, and skips other repositories", () => {
		expect(linkedIssueNumbers("Refs #4. Fixes #12, closes acme/shop#9 and other/repo#5", "acme/shop")).toEqual([12, 9, 4]);
		expect(linkedIssueNumbers("see https://x.io/page#3 and abc#2 and &#123;", "acme/shop")).toEqual([]);
	});

	it("caps GitHub labels", () => {
		expect(githubLabels(["Bug", "bug", "Needs Triage", "x".repeat(60)])).toEqual(["bug", "needs-triage", "x".repeat(40)]);
		expect(githubLabels(Array.from({ length: 30 }, (_, index) => `l${index}`))).toHaveLength(20);
	});
});

describe("handleBridgeEvent", () => {
	it("creates a work item for a new issue when the repo syncs issues", async () => {
		const { fake } = setup(null);
		const outcome = await handleBridgeEvent(fake.client, link, issuePayload("opened"));
		expect(outcome).toEqual({ handled: "created", itemIds: ["item-new"] });
		const lookup = fake.queries[0];
		expect(hasFilter(lookup, "eq", "github_repo", "acme/shop")).toBe(true);
		expect(hasFilter(lookup, "eq", "github_issue_number", 12)).toBe(true);
		expect(fake.rpcCalls[0].args).toMatchObject({
			p_workspace_id: WORKSPACE,
			p_title: "Checkout breaks on Safari",
			p_description: "Steps...",
			p_source: "github",
			p_author_kind: "github",
			p_fields: { labels: ["bug", "needs-triage"], github_repo: "acme/shop", github_issue_number: 12, github_issue_url: "https://github.com/acme/shop/issues/12" },
		});
	});

	it("doesn't create items when sync is off", async () => {
		const { fake } = setup(null);
		expect(await handleBridgeEvent(fake.client, { ...link, sync_issues: false }, issuePayload("opened"))).toEqual({ handled: "not_synced", itemIds: [] });
		expect(fake.rpcCalls).toHaveLength(0);
	});

	it("keeps Phaseo's own text on edits but merges labels", async () => {
		const { fake, updates } = setup(itemRow());
		await handleBridgeEvent(fake.client, link, issuePayload("edited", { title: "New title", body: "New body" }));
		expect(updates()[0]).toMatchObject({ labels: ["bug", "needs-triage"] });
		expect(updates()[0]).not.toHaveProperty("title");
		expect(updates()[0]).not.toHaveProperty("description");
	});

	it("follows GitHub's text for items that started on GitHub", async () => {
		const { fake, updates } = setup(itemRow({ source: "github" }));
		await handleBridgeEvent(fake.client, link, issuePayload("edited", { title: "New title", body: "New body" }));
		expect(updates()[0]).toMatchObject({ title: "New title", description: "New body" });
	});

	it("closes and reopens items with state events", async () => {
		const closed = setup(itemRow());
		await handleBridgeEvent(closed.fake.client, link, issuePayload("closed"));
		expect(closed.updates()[0]).toMatchObject({ state: "done" });
		expect(closed.updates()[0].closed_at).toEqual(expect.any(String));
		expect(closed.events()[0]).toMatchObject({ kind: "state", author_kind: "github", data: { from: "todo", to: "done" } });

		const reopened = setup(itemRow({ state: "done", closed_at: "2026-11-01T00:00:00Z" }));
		await handleBridgeEvent(reopened.fake.client, link, issuePayload("reopened"));
		expect(reopened.updates()[0]).toMatchObject({ state: "todo", closed_at: null });
	});

	it("adds GitHub comments to the timeline", async () => {
		const { fake, events } = setup(itemRow());
		const payload = parseBridgePayload({
			event: "issue_comment",
			action: "created",
			repo: "acme/shop",
			issue: { number: 12, title: "x", body: "", state: "open", html_url: "https://github.com/acme/shop/issues/12", user: "octo", labels: [] },
			comment: { body: "Still broken", user: "hubot", html_url: "https://github.com/acme/shop/issues/12#issuecomment-1" },
		})!;
		expect(await handleBridgeEvent(fake.client, link, payload)).toEqual({ handled: "comment", itemIds: ["item-1"] });
		expect(events()[0]).toMatchObject({ kind: "comment", author_kind: "github", author_name: "hubot", body: "Still broken" });
	});

	it("links pull requests, moves items to review when opened and to done when merged", async () => {
		const pr = (action: string, merged = false) => parseBridgePayload({
			event: "pull_request",
			action,
			repo: "acme/shop",
			pull_request: { number: 40, title: "Fix checkout", html_url: "https://github.com/acme/shop/pull/40", state: merged ? "closed" : "open", merged, body: "Fixes #12" },
		})!;
		const opened = setup(itemRow());
		await handleBridgeEvent(opened.fake.client, link, pr("opened"));
		expect(opened.updates()).toEqual([
			expect.objectContaining({ github_pr_url: "https://github.com/acme/shop/pull/40" }),
			expect.objectContaining({ state: "in_review" }),
		]);

		const merged = setup(itemRow({ state: "in_review", github_pr_url: "https://github.com/acme/shop/pull/40" }));
		await handleBridgeEvent(merged.fake.client, link, pr("closed", true));
		expect(merged.updates()).toEqual([expect.objectContaining({ state: "done" })]);
		expect(merged.events().at(-1)).toMatchObject({ kind: "github", body: "Pull request #40 merged" });
	});

	it("upserts the agent run for the issue's item", async () => {
		const runPayload = (status: string, extra: Record<string, unknown> = {}) => parseBridgePayload({
			event: "agent_run",
			action: status,
			repo: "acme/shop",
			issue: { number: 12 },
			run: { id: "99-1", status, run_url: "https://github.com/acme/shop/actions/runs/99", model: "anthropic/claude-sonnet-4.6", summary: "", ...extra },
		})!;

		const started = setup(itemRow(), (query) => (query.table === "work_agent_runs" && query.op === "select" ? { data: null, error: null } : undefined));
		await handleBridgeEvent(started.fake.client, link, runPayload("running"));
		const insert = started.fake.queries.find((query) => query.table === "work_agent_runs" && query.op === "insert")!;
		expect(insert.payload).toMatchObject({ agent: "engineer", runner: "github_actions", status: "running", external_url: "https://github.com/acme/shop/actions/runs/99", work_item_id: "item-1", model: "anthropic/claude-sonnet-4.6" });
		expect(started.updates()[0]).toMatchObject({ state: "in_progress", assignee_agent: "engineer" });

		const finished = setup(itemRow({ state: "in_progress" }), (query) =>
			query.table === "work_agent_runs" && query.op === "select"
				? { data: { id: "run-1", started_at: "2026-11-02T00:00:00Z", output: { runId: "99-1" } }, error: null }
				: undefined,
		);
		await handleBridgeEvent(finished.fake.client, link, runPayload("succeeded", { pr_url: "https://github.com/acme/shop/pull/41", summary: "Fixed the null check", cost_nanos: 1200 }));
		const update = finished.fake.queries.find((query) => query.table === "work_agent_runs" && query.op === "update")!;
		expect(update.payload).toMatchObject({ status: "succeeded", summary: "Fixed the null check", cost_nanos: 1200, output: { runId: "99-1", prUrl: "https://github.com/acme/shop/pull/41" }, finished_at: expect.any(String) });
		expect(update.payload).not.toHaveProperty("started_at");
		expect(finished.updates()[0]).toMatchObject({ github_pr_url: "https://github.com/acme/shop/pull/41", state: "in_review" });
		expect(finished.events().at(-1)).toMatchObject({ kind: "agent_run", author_kind: "agent", body: "The engineer agent opened a pull request." });
	});
});
