import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

afterEach(() => vi.unstubAllGlobals());

describe("account profile settings route", () => {
	it("returns one private profile payload built from the authenticated workspace", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({
				id: "user-1",
				email: "person@example.com",
				created_at: "2025-01-01T00:00:00Z",
				user_metadata: { avatar_url: "https://example.com/avatar.png" },
			}), { status: 200 });
			if (url.includes("/users")) return new Response(JSON.stringify([{
				display_name: "Test Person",
				default_workspace_id: "workspace-1",
				created_at: "2025-01-01T00:00:00Z",
				obfuscate_info: false,
			}]), { status: 200 });
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "admin" }]), { status: 200 });
			if (url.includes("/workspaces") && url.includes("owner_user_id")) return new Response(JSON.stringify([{ owner_user_id: "user-1" }]), { status: 200 });
			if (url.includes("/workspaces")) return new Response(JSON.stringify([{ name: "Test Workspace" }]), { status: 200 });
			if (url.includes("gateway_requests")) return new Response(JSON.stringify([{
				created_at: new Date().toISOString(),
				model_id: "openai/gpt-test",
				usage: { input_tokens: 10, output_tokens: 5 },
				cost_nanos: 250_000_000,
			}]), { status: 200 });
			if (url.includes("data_models")) return new Response(JSON.stringify([{ model_id: "openai/gpt-test", name: "GPT Test" }]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));

		const response = await app.request(
			"https://phaseo.app/api/account/settings/profile?obfuscateInfo=1",
			{ headers: { authorization: "Bearer token" } },
			env,
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		await expect(response.json()).resolves.toMatchObject({
			obfuscateInfo: true,
			profile: {
				userId: "user-1",
				displayName: "Test Person",
				workspaceName: "Test Workspace",
				totalRequests: 1,
				totalTokens: 15,
				topModels: [{ id: "openai/gpt-test", name: "GPT Test", requests: 1, tokens: 15 }],
			},
		});
	});
});
