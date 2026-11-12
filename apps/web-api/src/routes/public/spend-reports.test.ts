import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/data/supabase", () => ({ getDataClient: () => ({ rpc: mocks.rpc }) }));

const { publicSpendReportsRouter } = await import("./spend-reports");

const app = new Hono<{ Bindings: Env }>();
app.route("/spend-reports", publicSpendReportsRouter);
const token = "0f8fad5b-d9cb-469f-a165-70867728950e";
const env = { ENV: "production" } as Env;

describe("public spend report unsubscribe routes", () => {
	beforeEach(() => mocks.rpc.mockReset());

	it("rejects malformed tokens without touching the database", async () => {
		expect((await app.request("https://phaseo.app/spend-reports/nope", {}, env)).status).toBe(404);
		expect((await app.request("https://phaseo.app/spend-reports/nope/unsubscribe", { method: "POST" }, env)).status).toBe(404);
		expect(mocks.rpc).not.toHaveBeenCalled();
	});

	it("reads the subscription for the page, and 404s an unknown token", async () => {
		mocks.rpc.mockResolvedValueOnce({ data: { workspace_name: "Acme", subscribed: true }, error: null });
		const known = await app.request(`https://phaseo.app/spend-reports/${token}`, {}, env);
		expect(known.status).toBe(200);
		expect(known.headers.get("cache-control")).toBe("private, no-store");
		expect(await known.json()).toEqual({ workspaceName: "Acme", subscribed: true });
		expect(mocks.rpc).toHaveBeenCalledWith("set_spend_report_subscription", { p_token: token, p_subscribed: null });
		mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
		expect((await app.request(`https://phaseo.app/spend-reports/${token}`, {}, env)).status).toBe(404);
	});

	it("unsubscribes from a one-click form POST without cookies, and subscribes again", async () => {
		mocks.rpc.mockResolvedValueOnce({ data: { workspace_name: "Acme", subscribed: false }, error: null });
		const off = await app.request(`https://phaseo.app/spend-reports/${token}/unsubscribe`, {
			method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click",
		}, env);
		expect(off.status).toBe(200);
		expect(await off.json()).toEqual({ workspaceName: "Acme", subscribed: false });
		expect(mocks.rpc).toHaveBeenLastCalledWith("set_spend_report_subscription", { p_token: token, p_subscribed: false });
		mocks.rpc.mockResolvedValueOnce({ data: { workspace_name: "Acme", subscribed: true }, error: null });
		const on = await app.request(`https://phaseo.app/spend-reports/${token}/subscribe`, { method: "POST" }, env);
		expect(await on.json()).toEqual({ workspaceName: "Acme", subscribed: true });
		expect(mocks.rpc).toHaveBeenLastCalledWith("set_spend_report_subscription", { p_token: token, p_subscribed: true });
	});

	it("returns 503 when the database fails, so the client can retry", async () => {
		mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "down" } });
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		expect((await app.request(`https://phaseo.app/spend-reports/${token}/unsubscribe`, { method: "POST" }, env)).status).toBe(503);
		error.mockRestore();
	});
});
