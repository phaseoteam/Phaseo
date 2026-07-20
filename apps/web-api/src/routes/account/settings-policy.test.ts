import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";

const env = {
	ENV: "development" as const,
	SUPABASE_URL: "https://example.supabase.co",
	SUPABASE_ANON_KEY: "anon-key",
	SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

afterEach(() => vi.unstubAllGlobals());

describe("account policy settings routes", () => {
	it("returns private routing, preset, and guardrail payloads", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("/auth/v1/user")) return new Response(JSON.stringify({ id: "user-1", email: "user@example.com", created_at: "2025-01-01" }), { status: 200 });
			if (url.includes("workspace_members") && url.includes("teams%3Aworkspaces")) return new Response(JSON.stringify([{ workspace_id: "workspace-1", teams: { id: "workspace-1", name: "Team One" } }]), { status: 200 });
			if (url.includes("workspace_members")) return new Response(JSON.stringify([{ role: "admin" }]), { status: 200 });
			if (url.includes("/workspaces") && url.includes("owner_user_id")) return new Response(JSON.stringify([{ owner_user_id: "user-1" }]), { status: 200 });
			if (url.includes("/workspaces")) return new Response(JSON.stringify([{ id: "workspace-1", name: "Team One" }]), { status: 200 });
			if (url.includes("workspace_settings")) return new Response(JSON.stringify([{ routing_mode: "latency", response_healing_enabled: true, response_healing_locked: false, response_healing_mode: "strict", alpha_channel_enabled: true, beta_channel_enabled: false }]), { status: 200 });
			if (url.includes("/presets")) return new Response(JSON.stringify([{ id: "preset-1", workspace_id: "workspace-1", name: "Fast" }]), { status: 200 });
			if (url.includes("/keys")) return new Response(JSON.stringify([{ id: "key-1", name: "Production", prefix: "ph_", status: "active" }]), { status: 200 });
			if (url.includes("data_api_providers")) return new Response(JSON.stringify([{ api_provider_id: "openai", api_provider_name: "OpenAI" }]), { status: 200 });
			if (url.includes("data_api_provider_models")) return new Response(JSON.stringify([{ provider_id: "openai", api_model_id: "gpt-test", internal_model_id: "openai/gpt-test", is_active_gateway: true }]), { status: 200 });
			if (url.includes("workspace_guardrails")) return new Response(JSON.stringify([{ id: "guardrail-1", workspace_id: "workspace-1", name: "Default", enabled: true }]), { status: 200 });
			if (url.includes("key_guardrails")) return new Response(JSON.stringify([{ guardrail_id: "guardrail-1", key_id: "key-1" }]), { status: 200 });
			return new Response(JSON.stringify([]), { status: 200 });
		}));
		const init = { headers: { authorization: "Bearer session-token" } };
		const [routing, presets, guardrails, editor] = await Promise.all([
			app.request("https://phaseo.app/api/account/settings/routing?workspaceId=workspace-1", init, env),
			app.request("https://phaseo.app/api/account/settings/presets?workspaceId=workspace-1", init, env),
			app.request("https://phaseo.app/api/account/settings/guardrails?workspaceId=workspace-1", init, env),
			app.request("https://phaseo.app/api/account/settings/guardrails/editor?workspaceId=workspace-1&mode=edit&guardrailId=guardrail-1", init, env),
		]);
		for (const response of [routing, presets, guardrails, editor]) {
			expect(response.status).toBe(200);
			expect(response.headers.get("cache-control")).toBe("private, no-store");
			expect(response.headers.get("cloudflare-cdn-cache-control")).toBeNull();
		}
		await expect(routing.json()).resolves.toMatchObject({ routingMode: "latency", responseHealingEnabled: true, responseHealingMode: "strict", teamName: "Team One" });
		await expect(presets.json()).resolves.toMatchObject({ currentUserId: "user-1", teamsWithPresets: [{ id: "workspace-1", presets: [{ id: "preset-1" }] }] });
		await expect(guardrails.json()).resolves.toMatchObject({ guardrails: [{ id: "guardrail-1" }], guardrailKeyIdsByGuardrailId: { "guardrail-1": ["key-1"] }, keys: [{ id: "key-1" }] });
		await expect(editor.json()).resolves.toMatchObject({ mode: "edit", guardrail: { id: "guardrail-1" }, initialKeyIds: ["key-1"], teamName: "Team One" });
	});
});
