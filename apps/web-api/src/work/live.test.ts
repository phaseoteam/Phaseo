import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { fakeDataClient, hasFilter, type FakeHandler } from "./fakeDataClient.testing";
import { laterStamp } from "./live";

const WS = "00000000-0000-4000-8000-000000000001";
const state: { handler: FakeHandler; fake: ReturnType<typeof fakeDataClient> | null } = { handler: () => undefined, fake: null };
vi.mock("@/routes/account/work-shared", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/routes/account/work-shared")>();
	return { ...actual, accessFromQuery: async () => { state.fake = fakeDataClient((query) => state.handler(query)); return { context: { client: state.fake.client, workspaceId: WS, user: { id: "me" } } }; } };
});
const { registerLiveRoutes } = await import("./live");
const app = () => { const router = new Hono(); registerLiveRoutes(router); return router; };

describe("live stamps", () => {
	it("takes the later timestamp", () => {
		expect(laterStamp("2026-11-02T10:00:00Z", "2026-11-02T11:00:00Z")).toBe("2026-11-02T11:00:00Z");
		expect(laterStamp(null, "b")).toBe("b");
		expect(laterStamp("a", undefined)).toBe("a");
	});

	it("stamps one item by its newest change or activity", async () => {
		state.handler = () => ({ data: { updated_at: "2026-11-02T10:00:00Z", last_activity_at: "2026-11-02T10:05:00Z" }, error: null });
		const response = await app().request(`/live?workspaceId=${WS}&number=12`);
		expect(await response.json()).toEqual({ stamp: "2026-11-02T10:05:00Z" });
		expect(hasFilter(state.fake!.queries[0]!, "eq", "number", 12)).toBe(true);
	});

	it("stamps the workspace by its newest item change", async () => {
		state.handler = () => ({ data: [{ updated_at: "2026-11-02T09:00:00Z" }], error: null });
		const response = await app().request(`/live?workspaceId=${WS}`);
		expect(await response.json()).toEqual({ stamp: "2026-11-02T09:00:00Z" });
		expect(state.fake!.queries[0]!.filters).toContainEqual(["limit", 1]);
	});

	it("refuses a bad item number", async () => {
		expect((await app().request(`/live?workspaceId=${WS}&number=abc`)).status).toBe(400);
	});
});
