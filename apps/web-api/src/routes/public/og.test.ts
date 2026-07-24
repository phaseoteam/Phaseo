import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";
const env = { ENV: "development" as const, SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "key" };
afterEach(() => vi.unstubAllGlobals());

describe("public OG payload", () => {
	it("loads visible model metadata without exposing hidden rows", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{ model_id: "openai/gpt-test", name: "GPT Test", organisation_id: "openai", status: "Available" }]), { status: 200 })));
		const response = await app.request("https://phaseo.app/api/_web/og?kind=models&id=openai%2Fgpt-test", {}, env);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-tag")).toBe("web-api-og");
		await expect(response.json()).resolves.toEqual({ payload: { id: "openai/gpt-test", name: "GPT Test", logoId: "openai", badge: "Available" } });
	});
});
