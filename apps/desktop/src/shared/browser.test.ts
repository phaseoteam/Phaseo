import { describe, expect, it } from "vitest";
import { isLoopbackUrl, localUrlsIn, openableLocalUrl, previewPrinted, probeUrl, urlPort, agentBrowserCloseConfirmation, agentCursorOpacity, browserCommand, browserDeviceFrame, browserRecordingExtension, browserUrl, browserViewport, browserViewportPresets, browserZoomLevels, chooseBrowserRecordingMimeType, describeBrowserError, planBrowserCrashRecovery, resizeBrowserViewport, stepBrowserZoom } from "./browser";

describe("browser navigation boundary", () => {
	it.each(["https://example.com/path?q=test", "http://127.0.0.1:3000/", "http://localhost:5173/"])("accepts web and development address %s", value => expect(browserUrl(value)).toBe(value));
	it.each(["javascript:alert(1)", "file:///C:/private", "data:text/html,test", "phaseo://settings", "https://name:secret@example.com", "not a url", "https://example.com/" + "x".repeat(8192)])("rejects unsafe address %s", value => expect(() => browserUrl(value)).toThrow());
});

describe("browser viewports", () => {
	it("has T3 Code's seventeen device presets", () => { expect(browserViewportPresets).toHaveLength(17); expect(new Set(browserViewportPresets.map(preset => preset.id)).size).toBe(17); });
	it.each([[{ mode: "fill" }, { mode: "fill" }], [{ mode: "device", width: 390, height: 844, preset: "iphone-12-pro" }, { mode: "device", width: 390, height: 844, preset: "iphone-12-pro" }], [{ mode: "device", width: 1200, height: 700, extra: true }, { mode: "device", width: 1200, height: 700 }], ["desktop", { mode: "fill" }], ["tablet-landscape", { mode: "device", width: 1024, height: 768, preset: "ipad-mini" }]])("accepts %j", (value, expected) => expect(browserViewport(value)).toEqual(expected));
	it.each([undefined, null, {}, "unknown", "", 42, { mode: "device", width: 100, height: 800 }, { mode: "device", width: 390.5, height: 800 }, { mode: "device", width: 3840, height: 3840 }, { mode: "device", width: 390, height: 844, preset: "nokia" }])("rejects malformed viewport %j", value => expect(() => browserViewport(value)).toThrow("Invalid browser viewport"));
	it("fits a device inside the area and centres it", () => {
		expect(browserDeviceFrame({ x: 10, y: 38, width: 500, height: 600 }, { mode: "device", width: 390, height: 844 })).toEqual({ x: 122, y: 38, width: 277, height: 600, scale: 600 / 844 });
		expect(browserDeviceFrame({ x: 0, y: 0, width: 1000, height: 1000 }, { mode: "device", width: 390, height: 844 })).toEqual({ x: 305, y: 78, width: 390, height: 844, scale: 1 });
	});
	it("resizes from a rail twice the pointer distance, inside the limits", () => {
		expect(resizeBrowserViewport({ width: 400, height: 800 }, { x: 10, y: 0 }, 1, "east")).toEqual({ width: 420, height: 800 });
		expect(resizeBrowserViewport({ width: 400, height: 800 }, { x: 10, y: 0 }, 0.5, "west")).toEqual({ width: 360, height: 800 });
		expect(resizeBrowserViewport({ width: 400, height: 800 }, { x: 0, y: -1000 }, 1, "south")).toEqual({ width: 400, height: 240 });
		expect(resizeBrowserViewport({ width: 400, height: 800 }, { x: 50, y: 0 }, 1, "east", 0.5)).toEqual({ width: 500, height: 1000 });
	});
});

describe("browser zoom", () => {
	it("steps through T3 Code's levels and stops at the ends", () => {
		expect(stepBrowserZoom(1, 1)).toBe(1.1); expect(stepBrowserZoom(1, -1)).toBe(0.9); expect(stepBrowserZoom(1.2, 1)).toBe(1.25); expect(stepBrowserZoom(1.2, -1)).toBe(1.1);
		expect(stepBrowserZoom(5, 1)).toBe(5); expect(stepBrowserZoom(0.25, -1)).toBe(0.25); expect(browserZoomLevels[0]).toBe(0.25); expect(browserZoomLevels.at(-1)).toBe(5);
	});
});

describe("browser requests", () => {
	it("accepts each action with its arguments", () => {
		expect(browserCommand({ id: "chat", type: "zoom", zoom: 1.5 })).toEqual({ id: "chat", type: "zoom", zoom: 1.5 });
		expect(browserCommand({ id: "chat", type: "colorScheme", colorScheme: "dark" })).toEqual({ id: "chat", type: "colorScheme", colorScheme: "dark" });
		expect(browserCommand({ id: "chat", type: "navigate", url: "https://example.com" })).toEqual({ id: "chat", type: "navigate", url: "https://example.com/" });
		expect(browserCommand({ id: "chat", type: "hardReload", extra: 1 })).toEqual({ id: "chat", type: "hardReload" });
		expect(browserCommand({ id: "chat", type: "show", bounds: { x: 1, y: 2, width: 3, height: 4, z: 9 } })).toEqual({ id: "chat", type: "show", bounds: { x: 1, y: 2, width: 3, height: 4 } });
	});
	it.each([null, { type: "reload" }, { id: "", type: "reload" }, { id: "x".repeat(201), type: "reload" }, { id: "chat", type: "explode" }, { id: "chat", type: "zoom", zoom: 1.2 }, { id: "chat", type: "colorScheme", colorScheme: "sepia" }, { id: "chat", type: "mute", muted: "yes" }, { id: "chat", type: "clearData", data: "history" }, { id: "chat", type: "navigate", url: "file:///x" }, { id: "chat", type: "show", bounds: { x: 0, y: 0, width: -1, height: 1 } }, { id: "chat", type: "viewport", viewport: "invalid" }])("rejects %j", value => expect(() => browserCommand(value)).toThrow());
});

describe("browser failures and crashes", () => {
	it("describes network errors in plain words", () => { expect(describeBrowserError("ERR_CONNECTION_REFUSED")).toBe("Connection refused"); expect(describeBrowserError("ERR_SOMETHING")).toBe("ERR_SOMETHING"); expect(describeBrowserError("")).toBe("Network error"); });
	it("reloads a crashed page after 250 ms, 500 ms and 1 s, then waits for the window to pass", () => {
		let state = { attempts: 0, since: null as number | null };
		const delays = [];
		for (let index = 0; index < 3; index++) { const plan = planBrowserCrashRecovery(state, 1000 + index)!; delays.push(plan.delay); state = plan.state; }
		expect(delays).toEqual([250, 500, 1000]);
		expect(planBrowserCrashRecovery(state, 2000)).toBeUndefined();
		expect(planBrowserCrashRecovery(state, 31_000)?.delay).toBe(250);
	});
});

describe("browser slots, separate windows and recordings", () => {
	it("places a page in the pane or the floating player, with rounded corners only where asked", () => {
		expect(browserCommand({ id: "chat", type: "show", bounds: { x: 1, y: 2, width: 3, height: 4 }, slot: "float", radius: 12 })).toEqual({ id: "chat", type: "show", bounds: { x: 1, y: 2, width: 3, height: 4 }, slot: "float", radius: 12 });
		expect(browserCommand({ id: "chat", type: "show", bounds: { x: 0, y: 0, width: 1, height: 1 } })).toEqual({ id: "chat", type: "show", bounds: { x: 0, y: 0, width: 1, height: 1 } });
		expect(browserCommand({ id: "chat", type: "hide", slot: "pane" })).toEqual({ id: "chat", type: "hide", slot: "pane" });
		expect(browserCommand({ id: "chat", type: "hide" })).toEqual({ id: "chat", type: "hide" });
		for (const bad of [{ slot: "window" }, { radius: -1 }, { radius: 100 }, { radius: "12" }]) expect(() => browserCommand({ id: "chat", type: "show", bounds: { x: 0, y: 0, width: 1, height: 1 }, ...bad })).toThrow();
		expect(() => browserCommand({ id: "chat", type: "hide", slot: "elsewhere" })).toThrow();
	});
	it("pops a page into its own window and back", () => { expect(browserCommand({ id: "chat", type: "popOut" })).toEqual({ id: "chat", type: "popOut" }); expect(browserCommand({ id: "chat", type: "popIn" })).toEqual({ id: "chat", type: "popIn" }); });
	it("records MP4 where it can and WebM otherwise", () => {
		expect(chooseBrowserRecordingMimeType(() => true)).toBe("video/mp4;codecs=avc1");
		expect(chooseBrowserRecordingMimeType(type => type.startsWith("video/webm"))).toBe("video/webm;codecs=vp9");
		expect(chooseBrowserRecordingMimeType(() => false)).toBeUndefined();
		expect(browserRecordingExtension("video/mp4;codecs=avc1")).toBe("mp4");
		expect(browserRecordingExtension("VIDEO/WEBM")).toBe("webm");
		for (const bad of ["image/png", "video/x-matroska", "", 4, "video/mp4".padEnd(200, " ")]) expect(() => browserRecordingExtension(bad)).toThrow();
	});
	it("fades the agent cursor after an action, fainter while the person drives", () => {
		expect(agentCursorOpacity(true, "human")).toBe(1);
		expect(agentCursorOpacity(false, "agent")).toBe(0.35);
		expect(agentCursorOpacity(false, "none")).toBe(0.35);
		expect(agentCursorOpacity(false, "human")).toBe(0.18);
	});
	it("asks before closing browsers an agent is driving, in T3 Code's words", () => {
		expect(agentBrowserCloseConfirmation(0)).toBeUndefined();
		expect(agentBrowserCloseConfirmation(1)?.split("\n")[0]).toBe("Close browser while the agent is using it?");
		expect(agentBrowserCloseConfirmation(3)?.split("\n")[0]).toBe("Close 3 browsers while the agent is using them?");
	});
});

describe("local addresses from terminals", () => {
	it("knows which addresses are on this computer and checks what may be probed", () => {
		for (const value of ["http://localhost:5173/", "http://127.0.0.1:3000", "https://app.localhost/", "http://[::1]:8080/", "http://0.0.0.0:4321"]) expect(isLoopbackUrl(value)).toBe(true);
		for (const value of ["https://example.com", "http://192.168.1.5:3000", "file:///C:/x", "localhost:3000", "not a url"]) expect(isLoopbackUrl(value)).toBe(false);
		expect(openableLocalUrl("http://0.0.0.0:4321/app")).toBe("http://localhost:4321/app");
		expect(probeUrl("http://0.0.0.0:3000")).toBe("http://localhost:3000/");
		expect(() => probeUrl("https://example.com")).toThrow("Only local addresses");
		expect(() => probeUrl(5)).toThrow();
		expect(urlPort("https://localhost/")).toBe(443);
		expect(urlPort("http://localhost:5173/")).toBe(5173);
	});
	it("finds the local addresses a dev server prints, through colour codes and punctuation", () => {
		const vite = "\u001b[32m  ➜  \u001b[39m\u001b[1mLocal\u001b[22m:   \u001b[36mhttp://localhost:\u001b[1m5173\u001b[22m/\u001b[39m\r\n  ➜  Network: http://192.168.1.5:5173/\r\n";
		expect(localUrlsIn(vite)).toEqual(["http://localhost:5173/"]);
		expect(localUrlsIn("Local: http://localhost:5173/\nReady on http://127.0.0.1:3000. Also (http://localhost:5173/)")).toEqual(["http://localhost:5173/", "http://127.0.0.1:3000/"]);
		expect(localUrlsIn("Listening on http://0.0.0.0:8000,")).toEqual(["http://localhost:8000/"]);
	});
	it("treats a printed address on the preview's port as ready, but not the echoed command", () => {
		expect(previewPrinted("PS C:\\app> pnpm dev\r\n\r\n  Local:   http://localhost:5173/\r\n", "http://localhost:5173", "pnpm dev")).toBe(true);
		expect(previewPrinted("PS C:\\app> npx wait-on http://localhost:5173 && pnpm e2e\r\n", "http://localhost:5173", "npx wait-on http://localhost:5173 && pnpm e2e")).toBe(false);
		expect(previewPrinted("Local: http://localhost:5174/", "http://localhost:5173/", "pnpm dev")).toBe(false);
		expect(previewPrinted("Local: http://localhost:3000/", "https://example.com/", "pnpm dev")).toBe(false);
	});
});
