import { afterEach, describe, expect, it, vi } from "vitest";
import app from "@/index";
import { publicOgRouter } from "./og";
const env = { ENV: "development" as const, SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "service" };
afterEach(() => vi.unstubAllGlobals());

describe("public OG payload", () => {
	it("loads visible model metadata without exposing hidden rows", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = input instanceof Request ? input.url : String(input);
			if (url.includes("catalog_model_is_public")) return new Response("true", { status: 200 });
			return new Response(JSON.stringify([{ model_slug: "openai/gpt-test", name: "GPT Test", lab_slug: "openai", status: "Available" }]), { status: 200 });
		}));
		const response = await app.request("https://phaseo.app/api/_web/og?kind=models&id=openai%2Fgpt-test", {}, env);
		expect(response.status).toBe(200);
		expect(response.headers.get("cache-tag")).toBe("web-api-og");
		await expect(response.json()).resolves.toEqual({ payload: { id: "openai/gpt-test", name: "GPT Test", logoId: "openai", badge: "Available" } });
	});

	it("allows discovery OG fallbacks only for queued model additions", async () => {
		vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes("model_discovery_review_items")) {
				return new Response(JSON.stringify([{ model_id: "gpt-new", provider_id: "openai" }]), { status: 200 });
			}
			return new Response("[]", { status: 200 });
		}));

		const response = await app.request("https://phaseo.app/api/_web/og?kind=models&id=openai%2Fgpt-new&discovery=1", {}, env);

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({
			payload: {
				id: "openai/gpt-new",
				name: "Gpt New",
				subtitle: "Detected by Phaseo model discovery",
				logoId: "openai",
			},
		});
	});

	it("does not render arbitrary discovery OG fallbacks", async () => {
		vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));

		const response = await app.request("https://phaseo.app/api/_web/og?kind=models&id=openai%2Fnot-queued&discovery=1", {}, env);

		expect(response.status).toBe(404);
	});
});

it("does not publish staged provider identities in social metadata", async () => {
	vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{ provider_slug: "synthetic", name: "Private fixture name", status: "not_ready", routable: false, routing_enabled: false, metadata: { self_serve: {} } }]), { status: 200 })));
	const response = await publicOgRouter.request("https://example.test/og?kind=api-providers&id=synthetic", {}, env);
	expect(response.status).toBe(404);
	expect(await response.text()).not.toContain("Private fixture name");
	expect(response.headers.get("cache-control")).toContain("no-store");
});

it("does not publish disabled organisation identities in social metadata", async () => {
	vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{ lab_slug: "synthetic", name: "Private lab", status: "disabled" }]), { status: 200 })));
	const response = await publicOgRouter.request("https://example.test/og?kind=organisations&id=synthetic", {}, env);
	expect(response.status).toBe(404);
	expect(await response.text()).not.toContain("Private lab");
	expect(response.headers.get("cache-control")).toContain("no-store");
});

it("checks model visibility before reading its name", async () => {
	const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response("false", { status: 200 }));
	vi.stubGlobal("fetch", fetchMock);
	const response = await publicOgRouter.request("https://example.test/og?kind=models&id=hidden/model", {}, env);
	expect(response.status).toBe(404);
	expect(fetchMock).toHaveBeenCalledTimes(1);
	expect(String(fetchMock.mock.calls[0]?.[0])).toContain("catalog_model_is_public");
});
