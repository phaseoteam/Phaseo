import { describe, expect, it } from "vitest";
import { resolveUpdateFeedUrl } from "./updateFeed";

const builtIn = "https://updates.phaseo.app/desktop";

describe("resolveUpdateFeedUrl", () => {
	it("ignores the environment override in packaged builds", () => {
		expect(resolveUpdateFeedUrl(true, { PHASEO_DESKTOP_UPDATE_URL: "https://evil.example/feed" }, builtIn)).toBe(builtIn);
		expect(resolveUpdateFeedUrl(true, { PHASEO_DESKTOP_UPDATE_URL: "https://evil.example/feed" }, undefined)).toBeUndefined();
	});

	it("lets development runs override the built-in URL", () => {
		expect(resolveUpdateFeedUrl(false, { PHASEO_DESKTOP_UPDATE_URL: "http://localhost:8080/feed" }, builtIn)).toBe("http://localhost:8080/feed");
		expect(resolveUpdateFeedUrl(false, { PHASEO_DESKTOP_UPDATE_URL: "  " }, builtIn)).toBe(builtIn);
		expect(resolveUpdateFeedUrl(false, {}, undefined)).toBeUndefined();
	});
});
