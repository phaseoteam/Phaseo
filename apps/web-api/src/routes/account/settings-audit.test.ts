import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

afterEach(() => vi.unstubAllGlobals());

const defaultEvents = [{
	id: "00000000-0000-4000-8000-000000000001", workspace_id: "workspace-1", actor_user_id: "user-1",
	action: "api_key.created", target_type: "api_key", target_id: "key-1",
	target_name: "Production", metadata: { status: "active" }, request_id: null,
	created_at: "2026-08-30T10:00:00Z",
}];

function mockFetch(role: "admin" | "member", events = defaultEvents, auditUrls?: string[]) {
	return vi.fn(async (input: RequestInfo | URL) => {
		const url = input instanceof Request ? input.url : String(input);
		if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "admin@example.com", app_metadata: {}, user_metadata: {} }), { status: 200 });
		if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role }]), { status: 200 });
		if (url.includes("workspace_audit_events")) { auditUrls?.push(url); return new Response(JSON.stringify(events), { status: 200 }); }
		if (url.includes("/users")) {
			expect(url).toContain("select=user_id%2Cdisplay_name");
			return new Response(JSON.stringify([{ user_id: "user-1", display_name: "Ada" }]), { status: 200 });
		}
		return new Response(JSON.stringify([]), { status: 200 });
	});
}

describe("workspace audit settings route", () => {
	it("returns sanitized workspace events to administrators", async () => {
		vi.stubGlobal("fetch", mockFetch("admin"));
		const response = await app.request("https://phaseo.app/api/account/settings/audit-events?workspaceId=workspace-1", { headers: { authorization: "Bearer session-token" } }, env);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		await expect(response.json()).resolves.toMatchObject({
			events: [{ action: "api_key.created", actor: { displayName: "Ada" }, target_name: "Production" }],
			workspaceId: "workspace-1",
		});
	});

	it("rejects ordinary workspace members", async () => {
		vi.stubGlobal("fetch", mockFetch("member"));
		const response = await app.request("https://phaseo.app/api/account/settings/audit-events?workspaceId=workspace-1", { headers: { authorization: "Bearer session-token" } }, env);
		expect(response.status).toBe(403);
	});

	it("returns an opaque cursor and applies it to the next page", async () => {
		const events = [
			...defaultEvents,
			{ ...defaultEvents[0], id: "00000000-0000-4000-8000-000000000002", created_at: "2026-08-30T09:00:00Z" },
		];
		const auditUrls: string[] = [];
		vi.stubGlobal("fetch", mockFetch("admin", events, auditUrls));
		const first = await app.request("https://phaseo.app/api/account/settings/audit-events?workspaceId=workspace-1&limit=1", { headers: { authorization: "Bearer session-token" } }, env);
		const firstPayload = await first.json() as { nextCursor: string };
		expect(firstPayload.nextCursor).toBe("2026-08-30T10:00:00Z|00000000-0000-4000-8000-000000000001");

		await app.request(`https://phaseo.app/api/account/settings/audit-events?workspaceId=workspace-1&limit=1&cursor=${encodeURIComponent(firstPayload.nextCursor)}`, { headers: { authorization: "Bearer session-token" } }, env);
		expect(auditUrls.at(-1)).toContain("or=");
	});
});
