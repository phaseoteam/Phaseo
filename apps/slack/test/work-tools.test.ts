import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearWorkGateCache, fileWorkItemTool, signWorkRequest, turnWorkTools, workFilingEnabled } from "../src/work-tools";
import { FakeDb, INSTALLATION_ID, WORKSPACE_ID } from "./fakes";

const NOW = Date.UTC(2026, 10, 2, 12, 0, 0);
const SECRET = "test-secret";
const env = { SLACK_STATE_SECRET: SECRET, PHASEO_WEB_ORIGIN: "https://phaseo.test", ENV: "preview" } as any;

let db: FakeDb;

beforeEach(() => {
	db = new FakeDb();
	clearWorkGateCache();
});

function adminWorkspace() {
	db.tables.workspaces.push({ id: WORKSPACE_ID, owner_user_id: "owner" });
	db.tables.workspace_members.push({ workspace_id: WORKSPACE_ID, user_id: "staff" });
	db.tables.users = [{ user_id: "staff", role: "admin" }, { user_id: "owner", role: "user" }];
}

function run(tool: ReturnType<typeof fileWorkItemTool>, input: Record<string, unknown>) {
	return (tool.execute as (input: unknown, context: unknown) => Promise<any>)(input, {});
}

function tool(fetchImpl: typeof fetch, searched = false, notes: string[] = []) {
	return fileWorkItemTool({
		env, installationId: INSTALLATION_ID, channel: "C0GENERAL1", threadTs: "1762084800.000100", slackUserId: "U0PERSON01",
		permalink: async () => "https://acme.slack.com/archives/C0GENERAL1/p1762084800000100",
		notes, searched: async () => searched, now: () => NOW, fetchImpl,
	});
}

describe("signature", () => {
	it("matches the fixed vector web-api verifies", async () => {
		expect(await signWorkRequest(SECRET, 1762084800, '{"title":"x"}')).toBe("v1=cd7afac4d34a1bd29de1188e9cbf1fbc1249a1a47f5dd9548b1abb307906653a");
	});
});

describe("gate", () => {
	it("is on only for workspaces with a Phaseo internal admin", async () => {
		db.tables.workspaces.push({ id: WORKSPACE_ID, owner_user_id: "owner" });
		db.tables.users = [{ user_id: "owner", role: "user" }];
		await expect(workFilingEnabled(db, WORKSPACE_ID, NOW)).resolves.toBe(false);
		clearWorkGateCache();
		adminWorkspace();
		await expect(workFilingEnabled(db, WORKSPACE_ID, NOW)).resolves.toBe(true);
	});

	it("is offered per turn only when gated in, never to outsiders or scheduled runs", async () => {
		adminWorkspace();
		const slack = { call: vi.fn() } as any;
		const turn = { channel: "C0GENERAL1", threadTs: "1.2", slackUserId: "U1", external: false };
		const deps = { env, db, now: () => NOW };
		const installation = { id: INSTALLATION_ID, workspace_id: WORKSPACE_ID };
		expect((await turnWorkTools(deps, turn, installation, slack, [], async () => false)).map((entry) => entry.id)).toEqual(["file_work_item"]);
		expect(await turnWorkTools(deps, { ...turn, external: true }, installation, slack, [], async () => false)).toEqual([]);
		expect(await turnWorkTools(deps, { ...turn, schedule: { id: "s", runAt: "t" } }, installation, slack, [], async () => false)).toEqual([]);
		expect(await turnWorkTools({ ...deps, env: { ...env, SLACK_STATE_SECRET: "" } }, turn, installation, slack, [], async () => false)).toEqual([]);
	});
});

describe("file_work_item", () => {
	it("posts a signed request to web-api and returns the item", async () => {
		const notes: string[] = [];
		const fetchImpl = vi.fn(async () => Response.json({ ok: true, item: { number: 12, url: "https://phaseo.test/work/12" }, customerMatched: true }));
		const result = await run(tool(fetchImpl as any, false, notes), { title: "SSO request", description: "We need SSO", kind: "ask", customer: "Acme" });
		expect(result).toMatchObject({ filed: true, number: 12, url: "https://phaseo.test/work/12" });
		const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("https://phaseo.test/api/internal/work/slack/items");
		const headers = init.headers as Record<string, string>;
		expect(headers["x-phaseo-timestamp"]).toBe(String(NOW / 1000));
		expect(headers["x-phaseo-signature"]).toBe(await signWorkRequest(SECRET, NOW / 1000, String(init.body)));
		expect(JSON.parse(String(init.body))).toMatchObject({ kind: "ask", customer: "Acme", installationId: INSTALLATION_ID, permalink: expect.stringContaining("slack.com") });
		expect(notes).toEqual(["filed work item #12 (ask)"]);
	});

	it("refuses once the answer has searched Slack", async () => {
		const fetchImpl = vi.fn();
		const result = await run(tool(fetchImpl as any, true), { title: "x", description: "y", kind: "item" });
		expect(result.filed).toBe(false);
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("says when the workspace isn't allowed", async () => {
		const fetchImpl = vi.fn(async () => Response.json({ error: "work_not_enabled" }, { status: 403 }));
		const result = await run(tool(fetchImpl as any), { title: "x", description: "y", kind: "item" });
		expect(result).toMatchObject({ filed: false, note: expect.stringContaining("isn't available") });
	});
});
