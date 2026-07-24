import { describe, expect, it } from "vitest";
import app from "@/index";

describe("chat route boundary", () => {
	it.each(["text", "playground", "audio", "image", "video", "embeddings", "moderation", "realtime/session"])("requires bearer authentication for POST /api/chat/%s", async (route) => {
		const response = await app.request(`https://phaseo.app/api/chat/${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }, { ENV: "development" });
		expect(response.status).toBe(401);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(response.headers.get("vary")).toContain("Authorization");
	});
});
