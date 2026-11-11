import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";
import { formatConnectUsd } from "./settings-connect";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};
const WORKSPACE = "10000000-0000-4000-8000-000000000001";
const URL_BASE = `https://phaseo.app/api/account/settings/connect?workspaceId=${WORKSPACE}`;
const auth = { authorization: "Bearer session-token" };

// 10 days of November 2026 (30 days) so far, still on.
const stateRow = {
	enabled: true, payment_due: false, enabled_at: "2026-11-01T09:00:00Z", disabled_at: null,
	period_start: "2026-11-01", days_on: 10, days_in_month: 30,
	charge_so_far_nanos: "333333333", estimated_nanos: "1000000000", pending_nanos: "0", pending_months: 0,
};

type Seen = { url: string; body?: unknown };

function mockFetch(role: "admin" | "member" | null, options: { switched?: boolean; seen?: Seen[]; state?: Record<string, unknown> } = {}) {
	return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = input instanceof Request ? input.url : String(input);
		const body = init?.body ? JSON.parse(String(init.body)) : undefined;
		options.seen?.push({ url, body });
		if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "a@example.com", app_metadata: {}, user_metadata: {} }), { status: 200 });
		if (url.includes("workspace_members")) return new Response(JSON.stringify(role ? [{ role }] : []), { status: 200 });
		if (url.includes("/workspaces")) return new Response(JSON.stringify([{ owner_user_id: "someone-else", slug: "acme", name: "Acme", logo_url: null }]), { status: 200 });
		if (url.includes("/rpc/get_connect_state")) return new Response(JSON.stringify([{ ...stateRow, ...options.state }]), { status: 200 });
		if (url.includes("/rpc/set_connect_enabled")) return new Response(JSON.stringify(options.switched ?? true), { status: 200 });
		return new Response(JSON.stringify([]), { status: 201 });
	});
}

afterEach(() => vi.unstubAllGlobals());

describe("Phaseo Connect settings route", () => {
	it("shows any member this month's days, charge and estimate, rounded down", async () => {
		vi.stubGlobal("fetch", mockFetch("member"));
		const response = await app.request(URL_BASE, { headers: auth }, env);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		await expect(response.json()).resolves.toEqual({
			connect: {
				workspaceId: WORKSPACE, workspaceName: "Acme", canManage: false,
				enabled: true, paymentDue: false, active: true, enabledAt: "2026-11-01T09:00:00Z", disabledAt: null,
				priceNanos: 1_000_000_000, price: "$1.00",
				month: { periodStart: "2026-11-01", daysOn: 10, daysInMonth: 30, chargeSoFarNanos: 333_333_333, chargeSoFar: "$0.33", estimatedNanos: 1_000_000_000, estimated: "$1.00" },
				unpaid: { months: 0, amountNanos: 0, amount: "$0.00" },
			},
		});
	});

	it("says Connect is off while a month is unpaid", async () => {
		vi.stubGlobal("fetch", mockFetch("admin", { state: { payment_due: true, pending_nanos: "333333333", pending_months: 1 } }));
		const body = await (await app.request(URL_BASE, { headers: auth }, env)).json() as { connect: Record<string, unknown> };
		expect([body.connect.enabled, body.connect.paymentDue, body.connect.active, body.connect.canManage]).toEqual([true, true, false, true]);
		expect(body.connect.unpaid).toEqual({ months: 1, amountNanos: 333_333_333, amount: "$0.33" });
	});

	it("lets an admin switch it, recording who did it", async () => {
		const seen: Seen[] = [];
		vi.stubGlobal("fetch", mockFetch("admin", { seen }));
		const response = await app.request(URL_BASE, { method: "PUT", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ enabled: true }) }, env);
		expect(response.status).toBe(200);
		const body = await response.json() as { changed: boolean; connect: { enabled: boolean } };
		expect([body.changed, body.connect.enabled]).toEqual([true, true]);
		expect(seen.find((call) => call.url.includes("/rpc/set_connect_enabled"))?.body).toEqual({ p_workspace_id: WORKSPACE, p_enabled: true, p_user_id: "user-1" });
		expect(seen.find((call) => call.url.includes("workspace_audit_events"))?.body).toMatchObject({ action: "connect.enabled", target_type: "connect_subscription", actor_user_id: "user-1" });
	});

	it("records nothing when the switch was already in that position", async () => {
		const seen: Seen[] = [];
		vi.stubGlobal("fetch", mockFetch("admin", { seen, switched: false }));
		const response = await app.request(URL_BASE, { method: "PUT", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify({ enabled: true }) }, env);
		expect((await response.json() as { changed: boolean }).changed).toBe(false);
		expect(seen.some((call) => call.url.includes("workspace_audit_events"))).toBe(false);
	});

	it("refuses members, non-members, bad bodies and bad workspace ids", async () => {
		vi.stubGlobal("fetch", mockFetch("member"));
		const put = (body: unknown, url = URL_BASE) => app.request(url, { method: "PUT", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify(body) }, env);
		expect((await put({ enabled: true })).status).toBe(403);
		vi.stubGlobal("fetch", mockFetch(null));
		expect((await app.request(URL_BASE, { headers: auth }, env)).status).toBe(403);
		vi.stubGlobal("fetch", mockFetch("admin"));
		expect((await put({ enabled: "yes" })).status).toBe(400);
		expect((await put({ enabled: true }, "https://phaseo.app/api/account/settings/connect?workspaceId=nope")).status).toBe(400);
	});
});

describe("formatConnectUsd", () => {
	it("never shows more than is charged", () => {
		expect(formatConnectUsd(333_333_333)).toBe("$0.33");
		expect(formatConnectUsd(32_258_064)).toBe("$0.03");
		expect(formatConnectUsd(999_999_999)).toBe("$0.99");
		expect(formatConnectUsd(1_000_000_000)).toBe("$1.00");
	});
});
