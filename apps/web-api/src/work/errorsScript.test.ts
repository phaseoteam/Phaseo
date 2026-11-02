import { afterEach, describe, expect, it, vi } from "vitest";
import { ERRORS_SCRIPT, roughMinifiedSize } from "./errorsScript";

type Listener = (event: unknown) => void;

function loadScript(dataset: Record<string, string> = { key: "pwe_test", release: "1.2.3", environment: "production" }) {
	const listeners: Record<string, Listener[]> = {};
	const beacons: Array<{ url: string; body: string }> = [];
	const window = {
		addEventListener: (name: string, listener: Listener) => {
			(listeners[name] ??= []).push(listener);
		},
	} as Record<string, unknown>;
	const document = {
		currentScript: { dataset, src: "https://phaseo.app/api/_web/work/errors.js?v=1" },
		addEventListener: () => undefined,
		visibilityState: "visible",
	};
	window.document = document;
	const navigator = {
		userAgent: "test-agent",
		sendBeacon: (url: string, blob: Blob) => {
			beacons.push({ url, body: blob as unknown as string });
			return true;
		},
	};
	const location = { origin: "https://shop.example.com", pathname: "/checkout" };
	class FakeBlob {
		constructor(public parts: string[]) {}
	}
	// The script reads its globals by name, as it would in a browser.
	new Function("window", "document", "navigator", "location", "Blob", "fetch", "setTimeout", ERRORS_SCRIPT)(
		window,
		document,
		navigator,
		location,
		FakeBlob,
		() => Promise.resolve(),
		setTimeout,
	);
	const sent = () => beacons.map((beacon) => ({ url: beacon.url, ...JSON.parse((beacon.body as unknown as FakeBlob).parts[0]) }));
	return { window, listeners, sent };
}

describe("errors.js", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("stays under 4 KB minified and uses no syntax newer than ES2017", () => {
		expect(roughMinifiedSize(ERRORS_SCRIPT)).toBeLessThan(4096);
		expect(ERRORS_SCRIPT).not.toMatch(/\?\.|\?\?|=>|`/);
		expect(() => new Function(ERRORS_SCRIPT)).not.toThrow();
	});

	it("captures errors and rejections, batches them and sends them to the key's endpoint", () => {
		vi.useFakeTimers();
		const { window, listeners, sent } = loadScript();
		const error = new TypeError("boom");
		error.stack = "TypeError: boom\n    at run (https://shop.example.com/app.js:1:2)";
		listeners.error[0]({ error, message: "boom" });
		listeners.unhandledrejection[0]({ reason: "nope" });
		expect(sent()).toHaveLength(0);
		vi.advanceTimersByTime(2_000);
		const [batch] = sent();
		expect(batch.url).toBe("https://phaseo.app/api/_web/work/errors/pwe_test");
		expect(batch.events).toHaveLength(2);
		expect(batch.events[0]).toMatchObject({
			type: "TypeError",
			message: "boom",
			release: "1.2.3",
			environment: "production",
			url: "https://shop.example.com/checkout",
			frames: [{ function: "run", file: "https://shop.example.com/app.js", line: 1, column: 2 }],
		});
		expect(batch.events[1]).toMatchObject({ type: "UnhandledRejection", message: "nope" });
		expect(typeof (window.PhaseoErrors as { capture: unknown }).capture).toBe("function");
	});

	it("drops repeats within 10 seconds, skips opaque script errors and stops at 50 per page", () => {
		vi.useFakeTimers();
		const { window, listeners, sent } = loadScript();
		const api = window.PhaseoErrors as { capture: (error: unknown) => void };
		// Thrown from the same place twice: same type, message and top frame.
		for (let index = 0; index < 2; index++) api.capture(new Error("same"));
		listeners.error[0]({ message: "Script error." });
		vi.advanceTimersByTime(2_000);
		expect(sent()[0].events).toHaveLength(1);
		for (let index = 0; index < 80; index++) api.capture(new Error(`e${index}`));
		vi.advanceTimersByTime(10_000);
		const total = sent().reduce((count, batch) => count + batch.events.length, 0);
		expect(total).toBe(50);
		expect(Math.max(...sent().map((batch) => batch.events.length))).toBeLessThanOrEqual(10);
	});
});
