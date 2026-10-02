import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env";

const mocks = vi.hoisted(() => {
	const key = { id: "key-1", workspace_id: "workspace-1", created_by: "creator-1", name: "Production", status: "active" };
	const select = vi.fn();
	const rpc = vi.fn();
	const client = { auth: { admin: { getUserById: async () => ({ data: { user: { user_metadata: { avatar_url: "https://example.com/avatar.jpg" } } } }) } }, from: (table: string) => ({ select: (columns: string) => {
		select(table, columns);
		return { eq: () => ({ maybeSingle: async () => ({ data: table === "keys" ? key : table === "users" ? { display_name: "Alice" } : { name: "Production workspace" }, error: null }) }) };
	} }) };
	return { key, select, rpc, client, authorized: true, signedIn: true, role: "admin" };
});

vi.mock("@/auth/requireUser", () => ({ requireUser: async () => mocks.signedIn ? { id: "user-1" } : null }));
vi.mock("@/data/supabase", () => ({ getDataClient: () => mocks.client }));
vi.mock("./context", () => ({ requireAccountWorkspace: async () => mocks.authorized ? { client: mocks.client, userClient: { rpc: mocks.rpc }, role: mocks.role } : null }));
vi.mock("@/lib/audit/workspaceAudit", () => ({ recordWorkspaceAuditEvent: vi.fn() }));
import { accountSettingsKeysRouter } from "./settings-keys";
const app = new Hono<{ Bindings: Env }>().route("/", accountSettingsKeysRouter);
const load = () => app.request("https://example.com/keys/key-1", {}, {} as Env);

describe("key detail access", () => {
	beforeEach(() => {
		vi.clearAllMocks(); mocks.authorized = true; mocks.signedIn = true; mocks.role = "admin"; mocks.key.status = "active";
		mocks.rpc.mockResolvedValue({ data: [{ key_id: "other", daily_request_count: 999 }, { key_id: "key-1", daily_request_count: 7 }], error: null });
	});
	it("returns creator and usage for this key with a safe column projection", async () => {
		const response = await load(); expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ creatorName: "Alice", creatorAvatarUrl: "https://example.com/avatar.jpg", canManage: true, usage: { key_id: "key-1", daily_request_count: 7 } });
		const columns = mocks.select.mock.calls.find(([table]) => table === "keys")?.[1].split(",");
		expect(columns).not.toContain("hash"); expect(columns).not.toContain("kid");
		expect(response.headers.get("cache-control")).toContain("no-store");
	});
	it("allows members to read without edit permission", async () => { mocks.role = "member"; expect(await (await load()).json()).toMatchObject({ canManage: false }); });
	it("loads a bounded daily rollup for this workspace and key", async () => {
		const today = new Date().toISOString().slice(0, 10);
		mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "get_usage_chart_rollup" ? [{ bucket: `${today}T00:00:00Z`, requests: 12, cost: "0.024" }] : [], error: null }));
		const payload = await (await load()).json() as any;
		expect(mocks.rpc).toHaveBeenCalledWith("get_usage_chart_rollup", expect.objectContaining({ p_team: "workspace-1", p_key_id: "key-1", p_bucket: "day" }));
		expect(payload.chart.points).toHaveLength(30);
		expect(payload.chart.points.at(-1)).toEqual({ date: today, requests: 12, spendUsd: 0.024 });
	});
	it("does not expose keys or query usage outside the user's workspace", async () => { mocks.authorized = false; expect((await load()).status).toBe(404); expect(mocks.rpc).not.toHaveBeenCalled(); });
	it("requires authentication", async () => { mocks.signedIn = false; expect((await load()).status).toBe(401); expect(mocks.select).not.toHaveBeenCalled(); });
	it("hides deleted keys", async () => { mocks.key.status = "deleted"; expect((await load()).status).toBe(404); });
	it("distinguishes a usage outage from zero usage", async () => { mocks.rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } }); expect(await (await load()).json()).toMatchObject({ usage: null }); });
});
