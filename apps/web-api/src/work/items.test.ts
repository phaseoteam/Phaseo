import { describe, expect, it, vi } from "vitest";
import {
	addWorkItemEvent,
	createWorkItem,
	formatGithubRepo,
	formatWorkItem,
	normalizeLabels,
	planWorkItemChanges,
	type DataClient,
} from "./items";
import type { GithubRepoRow, WorkItemRow } from "./types";

const NOW = "2026-11-02T12:00:00.000Z";

function item(overrides: Partial<WorkItemRow> = {}): WorkItemRow {
	return {
		id: "00000000-0000-4000-8000-000000000101", workspace_id: "00000000-0000-4000-8000-000000000001", number: 7,
		title: "Login fails", description: "", state: "todo", priority: 0, source: "manual", labels: ["bug"],
		assignee_user_id: null, assignee_agent: null, duplicate_of: null, error_group_id: null, github_repo: null,
		github_issue_number: null, github_issue_url: null, github_pr_url: null, triage_summary: null, due_at: null,
		created_by: null, created_at: NOW, updated_at: NOW, closed_at: null, project_id: null, cycle_id: null, parent_id: null,
		estimate: null, sla_due_at: null, last_activity_at: NOW, ...overrides,
	};
}

describe("planWorkItemChanges", () => {
	it("sets closed_at and writes a state event when an item is closed", () => {
		const plan = planWorkItemChanges(item(), { state: "done" }, NOW);
		expect(plan.patch).toEqual({ state: "done", closed_at: NOW, updated_at: NOW, last_activity_at: NOW });
		expect(plan.events).toEqual([{ kind: "state", data: { from: "todo", to: "done" } }]);
	});

	it("clears closed_at when an item is reopened", () => {
		const plan = planWorkItemChanges(item({ state: "done", closed_at: NOW }), { state: "todo" }, NOW);
		expect(plan.patch.closed_at).toBeNull();
	});

	it("keeps closed_at when moving between closed states", () => {
		const plan = planWorkItemChanges(item({ state: "done", closed_at: "2026-11-01T00:00:00Z" }), { state: "cancelled" }, NOW);
		expect(plan.patch).not.toHaveProperty("closed_at");
	});

	it("writes priority, assignee and link events only for real changes", () => {
		const plan = planWorkItemChanges(item({ priority: 2 }), {
			priority: 2,
			assigneeAgent: "engineer",
			duplicateOf: "00000000-0000-4000-8000-000000000102",
			title: "Login fails",
		}, NOW);
		expect(plan.events.map((event) => event.kind)).toEqual(["assignee", "link"]);
		expect(plan.patch).toEqual({ assignee_agent: "engineer", duplicate_of: "00000000-0000-4000-8000-000000000102", updated_at: NOW, last_activity_at: NOW });
	});

	it("returns an empty patch when nothing changes", () => {
		expect(planWorkItemChanges(item(), { state: "todo", labels: ["bug"] }, NOW)).toEqual({ patch: {}, events: [] });
	});
});

describe("normalizeLabels", () => {
	it("lowercases, trims and removes duplicates", () => {
		expect(normalizeLabels([" Bug ", "bug", "Good First"])).toEqual(["bug", "good-first"]);
	});

	it("rejects non-strings, long labels and too many labels", () => {
		expect(normalizeLabels([1])).toBeNull();
		expect(normalizeLabels(["x".repeat(41)])).toBeNull();
		expect(normalizeLabels(Array.from({ length: 21 }, (_, index) => `l${index}`))).toBeNull();
	});
});

describe("createWorkItem", () => {
	it("calls create_work_item with the fields object", async () => {
		const rpc = vi.fn(async () => ({ data: item({ number: 1 }), error: null }));
		const row = await createWorkItem({ rpc } as unknown as DataClient, {
			workspaceId: "ws", title: "  Crash on save  ", source: "error", errorGroupId: "group-1", labels: ["bug"], githubRepo: "acme/app",
		});
		expect(row.number).toBe(1);
		expect(rpc).toHaveBeenCalledWith("create_work_item", {
			p_workspace_id: "ws", p_title: "Crash on save", p_description: "", p_state: "triage", p_priority: 0, p_source: "error",
			p_created_by: null, p_author_kind: "system",
			p_fields: { labels: ["bug"], error_group_id: "group-1", github_repo: "acme/app" },
		});
	});

	it("throws when the RPC fails", async () => {
		const rpc = vi.fn(async () => ({ data: null, error: { message: "boom" } }));
		await expect(createWorkItem({ rpc } as unknown as DataClient, { workspaceId: "ws", title: "x" })).rejects.toThrow("boom");
	});
});

describe("addWorkItemEvent", () => {
	it("inserts a row with defaults", async () => {
		const insert = vi.fn(async () => ({ error: null }));
		await addWorkItemEvent({ from: () => ({ insert }) } as unknown as DataClient, { workspaceId: "ws", workItemId: "item", kind: "github", body: "hello" });
		expect(insert).toHaveBeenCalledWith({
			workspace_id: "ws", work_item_id: "item", kind: "github", author_kind: "system", author_user_id: null, author_name: null, body: "hello", data: {},
		});
	});
});

describe("formatters", () => {
	it("formats an item in camelCase with the duplicate's number", () => {
		const formatted = formatWorkItem(item({ duplicate_of: "dup" }), 3);
		expect(formatted).toMatchObject({ number: 7, duplicateOf: "dup", duplicateOfNumber: 3, assigneeAgent: null, closedAt: null });
	});

	it("never returns a repository's hashes or encrypted token", () => {
		const row: GithubRepoRow = {
			id: "r", workspace_id: "ws", repo: "acme/app", bridge_token_hash: "hash", bridge_token_prefix: "pwg_abcdefgh",
			github_token_ciphertext: "secret", sync_issues: true, created_by: null, created_at: NOW, last_event_at: null,
		};
		const formatted = formatGithubRepo(row);
		expect(formatted.hasGithubToken).toBe(true);
		expect(JSON.stringify(formatted)).not.toMatch(/hash"|secret/);
	});
});
