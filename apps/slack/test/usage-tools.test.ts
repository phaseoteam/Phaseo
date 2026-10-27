import { beforeEach, describe, expect, it } from "vitest";
import {
	conversationAllowsUsageData,
	isWorkspaceMember,
	linkedUserId,
	modelSearchPattern,
	monthStartIso,
	usageTools,
} from "../src/usage-tools";
import { FakeDb, INSTALLATION_ID, WORKSPACE_ID } from "./fakes";

const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);
const USER = "00000000-0000-4000-8000-0000000000d1";

let db: FakeDb;
let notes: string[];

function tool(id: string) {
	const found = usageTools({ db, workspaceId: WORKSPACE_ID, now: () => NOW, notes }).find((entry) => entry.id === id);
	if (!found || typeof found.execute !== "function") throw new Error(`no tool ${id}`);
	return (input: Record<string, unknown>) => (found.execute as (input: unknown, context: unknown) => Promise<any>)(input, {});
}

beforeEach(() => {
	db = new FakeDb();
	notes = [];
});

describe("usage tool gating", () => {
	const dm = { channel: "D0DIRECT01", kind: "dm" as const };
	const listed = { channel: "C0FINANCE1", kind: "mention" as const };
	const other = { channel: "C0RANDOM01", kind: "mention" as const };

	it("follows usage_data_mode: off, DMs only, or DMs and listed channels", () => {
		expect(conversationAllowsUsageData({ usage_data_mode: "off", usage_data_channel_ids: ["C0FINANCE1"] }, dm)).toBe(false);
		expect(conversationAllowsUsageData({ usage_data_mode: "dm", usage_data_channel_ids: ["C0FINANCE1"] }, dm)).toBe(true);
		expect(conversationAllowsUsageData({ usage_data_mode: "dm", usage_data_channel_ids: ["C0FINANCE1"] }, listed)).toBe(false);
		expect(conversationAllowsUsageData({ usage_data_mode: "dm_and_channels", usage_data_channel_ids: ["C0FINANCE1"] }, listed)).toBe(true);
		expect(conversationAllowsUsageData({ usage_data_mode: "dm_and_channels", usage_data_channel_ids: ["C0FINANCE1"] }, other)).toBe(false);
		expect(conversationAllowsUsageData({ usage_data_mode: "dm_and_channels", usage_data_channel_ids: null }, dm)).toBe(true);
	});

	it("needs a link to a current member or owner of the installation's workspace", async () => {
		await expect(linkedUserId(db, INSTALLATION_ID, "U0PERSON01")).resolves.toBeNull();
		db.tables.slack_user_links.push({ installation_id: INSTALLATION_ID, slack_user_id: "U0PERSON01", user_id: USER });
		await expect(linkedUserId(db, INSTALLATION_ID, "U0PERSON01")).resolves.toBe(USER);
		await expect(isWorkspaceMember(db, WORKSPACE_ID, USER)).resolves.toBe(false);
		db.tables.workspaces.push({ id: WORKSPACE_ID, owner_user_id: USER });
		await expect(isWorkspaceMember(db, WORKSPACE_ID, USER)).resolves.toBe(true);
		db.tables.workspaces = [];
		db.tables.workspace_members.push({ workspace_id: WORKSPACE_ID, user_id: USER });
		await expect(isWorkspaceMember(db, WORKSPACE_ID, USER)).resolves.toBe(true);
	});
});

describe("usage tool arguments", () => {
	it("get_spend calls get_workspace_spend_buckets for the workspace, with defaults, and reports dollars", async () => {
		db.rpcResults.get_workspace_spend_buckets = [
			{ bucket_start: "2026-09-28", group_key: "all", requests: 6, cost_nanos: "3500000000" },
			{ bucket_start: "2026-10-05", group_key: "all", requests: "5", cost_nanos: 12_500_000_000 },
		];
		await expect(tool("get_spend")({ from: "2026-09-28", to: "2026-10-11", bucket: "week" })).resolves.toEqual({
			from: "2026-09-28", to: "2026-10-11", bucket: "week", group_by: "none", currency: "USD",
			buckets: [
				{ start: "2026-09-28", group: "all", requests: 6, cost_usd: 3.5 },
				{ start: "2026-10-05", group: "all", requests: 5, cost_usd: 12.5 },
			],
		});
		await tool("get_spend")({ from: "2026-10-01", to: "2026-10-01" });
		await tool("get_spend")({ from: "2026-09-01", to: "2026-10-31", bucket: "month", group_by: "provider" });
		expect(db.rpcs).toEqual([
			{ fn: "get_workspace_spend_buckets", args: { p_workspace_id: WORKSPACE_ID, p_from: "2026-09-28", p_to: "2026-10-11", p_bucket: "week", p_group_by: "none" } },
			{ fn: "get_workspace_spend_buckets", args: { p_workspace_id: WORKSPACE_ID, p_from: "2026-10-01", p_to: "2026-10-01", p_bucket: "day", p_group_by: "none" } },
			{ fn: "get_workspace_spend_buckets", args: { p_workspace_id: WORKSPACE_ID, p_from: "2026-09-01", p_to: "2026-10-31", p_bucket: "month", p_group_by: "provider" } },
		]);
		expect(notes).toEqual(["get_spend 2026-09-28 to 2026-10-11 by week", "get_spend 2026-10-01 to 2026-10-01 by day", "get_spend 2026-09-01 to 2026-10-31 by month and provider"]);
	});

	it("refuses bad dates, ranges and options before calling the database", async () => {
		for (const input of [
			{ from: "2026-10-01" },
			{ from: "2026/10/01", to: "2026-10-02" },
			{ from: "2026-02-30", to: "2026-03-01" },
			{ from: "2026-10-02", to: "2026-10-01" },
			{ from: "2026-10-01", to: "2026-10-02", bucket: "year" },
			{ from: "2026-10-01", to: "2026-10-02", group_by: "key" },
		]) {
			await expect(tool("get_spend")(input)).rejects.toThrow(/must/);
		}
		expect(db.rpcs).toHaveLength(0);
	});

	it("get_credit_balance reads the wallet and this month's spend from the database", async () => {
		db.tables.wallets.push({ workspace_id: WORKSPACE_ID, balance_nanos: 25_000_000_000, reserved_nanos: 500_000_000 });
		db.rpcResults.get_workspace_recent_credit_spend = "7250000000";
		await expect(tool("get_credit_balance")({})).resolves.toEqual({
			currency: "USD", balance_usd: 25, held_for_requests_usd: 0.5, available_usd: 24.5, spent_this_month_usd: 7.25, month_start: "2026-10-01",
		});
		expect(db.rpcs).toEqual([{ fn: "get_workspace_recent_credit_spend", args: { p_workspace_id: WORKSPACE_ID, p_since: "2026-10-01T00:00:00.000Z" } }]);
		expect(monthStartIso(Date.UTC(2026, 11, 31, 23, 59))).toBe("2026-12-01T00:00:00.000Z");
	});

	it("get_key_usage calls get_workspace_key_spend and names keys without exposing ids", async () => {
		db.rpcResults.get_workspace_key_spend = [
			{ key_id: "30000000-0000-4000-8000-000000000002", key_name: "Slack agent", key_prefix: "phaseo_v1_sk_bbbb", requests: 5, cost_nanos: 1_000_000_000 },
			{ key_id: null, key_name: null, key_prefix: null, requests: 1, cost_nanos: 10_000_000 },
		];
		await expect(tool("get_key_usage")({ from: "2026-10-01", to: "2026-10-02" })).resolves.toEqual({
			from: "2026-10-01", to: "2026-10-02", currency: "USD",
			keys: [
				{ key: "Slack agent", prefix: "phaseo_v1_sk_bbbb", requests: 5, cost_usd: 1 },
				{ key: null, prefix: null, requests: 1, cost_usd: 0.01 },
			],
		});
		expect(db.rpcs).toEqual([{ fn: "get_workspace_key_spend", args: { p_workspace_id: WORKSPACE_ID, p_from: "2026-10-01", p_to: "2026-10-02" } }]);
	});

	it("find_models searches visible models with a safe filter", async () => {
		db.tables.v2_models.push(
			{ model_slug: "openai/gpt-test", name: "GPT Test", lab_slug: "openai", status: "active", released_at: "2026-09-01T00:00:00Z", hidden: false },
			{ model_slug: "openai/gpt-hidden", name: "Hidden", lab_slug: "openai", status: "active", released_at: null, hidden: true },
		);
		await expect(tool("find_models")({ query: "gpt test" })).resolves.toEqual({
			models: [{ id: "openai/gpt-test", name: "GPT Test", lab: "openai", status: "active", released_at: "2026-09-01" }],
		});
		expect(db.queries.at(-1)?.query).toEqual({
			select: "model_slug,name,lab_slug,status,released_at",
			hidden: "is.false",
			or: "(model_slug.ilike.*gpt*test*,name.ilike.*gpt*test*)",
			order: "released_at.desc.nullslast",
			limit: "10",
		});
		// Characters that could change the filter are dropped.
		expect(modelSearchPattern("claude),id.eq.(x")).toBe("*claude*id.eq.*x*");
		expect(modelSearchPattern("(*,)")).toBeNull();
		await expect(tool("find_models")({ query: "()" })).rejects.toThrow("query must contain letters or numbers");
	});
});
