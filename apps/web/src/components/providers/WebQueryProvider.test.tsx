import { focusManager } from "@tanstack/react-query";
import { listenForQueryFocus } from "@/lib/query/browserLifecycle";

describe("WebQueryProvider browser focus behavior", () => {
	let browser: EventTarget;
	let page: EventTarget;
	let visibility: string;
	const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
	const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

	beforeEach(() => {
		jest.useFakeTimers({ now: 120_000 });
		browser = new EventTarget();
		page = new EventTarget();
		visibility = "visible";
		Object.defineProperty(page, "visibilityState", { get: () => visibility });
		Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
		Object.defineProperty(globalThis, "document", {
			configurable: true,
			value: page,
		});
		focusManager.setFocused(undefined);
		focusManager.setEventListener(listenForQueryFocus);
	});

	afterEach(() => {
		focusManager.setEventListener(() => () => undefined);
		focusManager.setFocused(undefined);
		for (const [key, descriptor] of [["window", originalWindow], ["document", originalDocument]] as const) {
			if (descriptor) Object.defineProperty(globalThis, key, descriptor);
			else Reflect.deleteProperty(globalThis, key);
		}
		jest.useRealTimers();
		jest.clearAllMocks();
	});

	it("notifies queries on every eligible return to the tab", () => {
		const focused = jest.fn();
		const unsubscribe = focusManager.subscribe((value) => { if (value) focused(); });
		try {
			browser.dispatchEvent(new Event("focus"));
			expect(focused).toHaveBeenCalledTimes(1);
			visibility = "hidden";
			page.dispatchEvent(new Event("visibilitychange"));
			jest.advanceTimersByTime(61_000);
			visibility = "visible";
			page.dispatchEvent(new Event("visibilitychange"));
			expect(focused).toHaveBeenCalledTimes(2);
		} finally { unsubscribe(); }
	});

	it("reports hidden tabs as unfocused after a prior focus", () => {
		browser.dispatchEvent(new Event("focus"));
		visibility = "hidden";
		page.dispatchEvent(new Event("visibilitychange"));
		expect(focusManager.isFocused()).toBe(false);
	});

	it("throttles duplicate returns without leaving a visible tab unfocused", () => {
		const focused = jest.fn();
		const unsubscribe = focusManager.subscribe((value) => { if (value) focused(); });
		try {
			browser.dispatchEvent(new Event("focus"));
			visibility = "hidden";
			page.dispatchEvent(new Event("visibilitychange"));
			visibility = "visible";
			page.dispatchEvent(new Event("visibilitychange"));
			expect(focusManager.isFocused()).toBe(true);
			expect(focused).toHaveBeenCalledTimes(1);
			jest.advanceTimersByTime(61_000);
			browser.dispatchEvent(new Event("focus"));
			expect(focused).toHaveBeenCalledTimes(2);
		} finally { unsubscribe(); }
	});
});
