import { beforeEach, describe, expect, it, vi } from "vitest";
const proxy = vi.hoisted(() => vi.fn());
vi.mock("@/chat/proxy", async (original) => ({ ...await original<typeof import("@/chat/proxy")>(), proxyGateway: proxy }));
import { chatRouter } from "./chat";

beforeEach(() => { proxy.mockReset(); proxy.mockResolvedValue(Response.json({ ok: true })); });

describe("document and video chat proxy contracts", () => {
	it.each([
		["ocr", { model: "mistral/ocr", image: "https://example.com/image.png" }],
		["rerank", { model: "cohere/rerank", query: "hello", documents: ["world"], top_n: 1 }],
	])("forwards %s through the authenticated gateway proxy", async (room, requestBody) => {
		const response = await chatRouter.request(`https://phaseo.app/${room}`, {
			method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestBody }),
		}, {}, { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as any);
		expect(response.status).toBe(200);
		expect(proxy).toHaveBeenCalledOnce();
		expect(proxy.mock.calls[0][3]).toMatchObject({ path: `/${room}`, requestBody, stream: false });
	});
	it("submits videos once and polls the same resource", async () => {
		const context = { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as any;
		await chatRouter.request("https://phaseo.app/video", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestBody: { model: "google/veo", prompt: "A forest" } }) }, {}, context);
		expect(proxy.mock.calls[0][3]).toMatchObject({ path: "/videos", requestBody: { model: "google/veo", prompt: "A forest" } });
		await chatRouter.request("https://phaseo.app/video", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ poll: { resourceId: "vid_123" } }) }, {}, context);
		expect(proxy.mock.calls[1][3]).toMatchObject({ method: "GET", path: "/videos/vid_123" });
	});
});
