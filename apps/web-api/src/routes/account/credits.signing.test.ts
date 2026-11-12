import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const sessionToken = `header.${btoa(JSON.stringify({ sub: "user-1", aal: "aal2" })).replace(/=+$/, "")}.signature`;
const env = { ENV: "development", SUPABASE_URL: "https://example.supabase.co", SUPABASE_ANON_KEY: "anon-key", SUPABASE_SERVICE_ROLE_KEY: "service-role-key", ASYNC_WEBHOOK_SECRET_ENCRYPTION_KEY: "test-notification-encryption-key" };
const DESTINATION_ID = "20000000-0000-4000-8000-000000000001";

afterEach(() => vi.unstubAllGlobals());

function stubDatabase(destinationType: string | null) {
	const writes: Array<{ url: string; body: Record<string, unknown> }> = [];
	vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		if (url.includes("/auth/v1/user")) return Response.json({ id: "user-1" });
		if (url.includes("workspace_members")) return Response.json([{ role: "admin" }]);
		if (url.includes("/workspaces")) return Response.json([{ owner_user_id: "user-1" }]);
		if (url.includes("notification_destinations")) {
			if (init?.method === "PATCH") {
				const body = JSON.parse(String(init.body)) as Record<string, unknown>;
				writes.push({ url, body });
				return Response.json([{ id: DESTINATION_ID, signing_secret_rotated_at: body.signing_secret_rotated_at }]);
			}
			return Response.json(destinationType ? [{ id: DESTINATION_ID, type: destinationType }] : []);
		}
		return Response.json([]);
	}));
	return writes;
}

const rotate = () => app.request(`https://phaseo.app/api/account/credits/notification-destinations/${DESTINATION_ID}/signing-secret`, {
	method: "POST",
	headers: { authorization: `Bearer ${sessionToken}`, "content-type": "application/json" },
	body: JSON.stringify({ workspaceId: "workspace-1" }),
}, env);

describe("notification destination signing secret route", () => {
	it("generates a secret for a custom webhook and stores it encrypted", async () => {
		const writes = stubDatabase("custom_webhook");
		const response = await rotate();
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toContain("no-store");
		const body = await response.json() as { signingSecret: string; signingSecretRotatedAt: string };
		expect(body.signingSecret).toMatch(/^whsec_/);
		expect(writes).toHaveLength(1);
		expect(writes[0]!.url).toContain("type=eq.custom_webhook");
		expect(writes[0]!.body).toMatchObject({ signing_secret_ciphertext: expect.any(String), signing_secret_iv: expect.any(String), signing_secret_key_version: "v1" });
		expect(JSON.stringify(writes[0]!.body)).not.toContain(body.signingSecret);
		expect(body.signingSecretRotatedAt).toBe(writes[0]!.body.signing_secret_rotated_at);
	});

	it("refuses destinations that are not custom webhooks", async () => {
		const writes = stubDatabase("slack");
		const response = await rotate();
		expect(response.status).toBe(400);
		await expect(response.json()).resolves.toEqual({ error: "notification_destination_not_signed" });
		expect(writes).toHaveLength(0);
	});

	it("returns not found for a destination outside the workspace", async () => {
		const writes = stubDatabase(null);
		expect((await rotate()).status).toBe(404);
		expect(writes).toHaveLength(0);
	});
});
