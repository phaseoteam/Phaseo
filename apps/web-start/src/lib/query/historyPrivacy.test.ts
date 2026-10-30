import { hideDocumentForSessionReset, listenForQueryHistory } from "./historyPrivacy";
import { createWebQueryClient } from "./queryClient";
import { webQueryKeys } from "./queryKeys";

describe("private document history restoration", () => {
	const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
	const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
	const privateKey = webQueryKeys.account.workspaceSearch({ userId: "a", workspaceId: "a" });
	let client: ReturnType<typeof createWebQueryClient>;
	let browser: EventTarget;
	let hidden: boolean;
	let hide: jest.Mock;
	let reload: jest.Mock;
	let stop: () => void;
	function show(persisted: boolean) {
		const event = new Event("pageshow");
		Object.defineProperty(event, "persisted", { value: persisted });
		browser.dispatchEvent(event);
	}
	beforeEach(() => {
		jest.useFakeTimers();
		client = createWebQueryClient();
		browser = new EventTarget();
		Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
		hidden = false;
		hide = jest.fn(() => { hidden = true; });
		reload = jest.fn(() => { expect(hidden).toBe(true); });
		stop = listenForQueryHistory(client, hide, reload);
		client.setQueryData(privateKey, ["private-a"]);
		client.setQueryData(webQueryKeys.public.search(), ["public"]);
	});
	afterEach(() => {
		stop();
		client.clear();
		jest.useRealTimers();
		for (const [key, descriptor] of [["window", originalWindow], ["document", originalDocument]] as const) {
			if (descriptor) Object.defineProperty(globalThis, key, descriptor);
			else Reflect.deleteProperty(globalThis, key);
		}
	});

	it("masks the DOM and clears fresh private data before the browser saves the page", () => {
		browser.dispatchEvent(new Event("pagehide"));
		expect(hidden).toBe(true);
		expect(client.getQueryData(privateKey)).toBeUndefined();
		expect(client.getQueryData(webQueryKeys.public.search())).toEqual(["public"]);
		expect(reload).not.toHaveBeenCalled();
	});

	it("keeps the saved document masked throughout restoration and reload", () => {
		browser.dispatchEvent(new Event("pagehide"));
		expect(hidden).toBe(true); // State the browser saves, before any pageshow handler.
		show(true);
		expect(reload).toHaveBeenCalledTimes(1);
		expect(hidden).toBe(true); // No asynchronous unmask of old server props.
	});

	it("also protects a persisted restore when no pagehide was observed", () => {
		show(true);
		expect(hidden).toBe(true);
		expect(client.getQueryData(privateKey)).toBeUndefined();
		expect(reload).toHaveBeenCalledTimes(1);
	});

	it("does not disturb first loads, tab visibility, or same-document history", () => {
		show(false);
		browser.dispatchEvent(new Event("popstate"));
		browser.dispatchEvent(new Event("visibilitychange"));
		expect(hide).not.toHaveBeenCalled();
		expect(reload).not.toHaveBeenCalled();
		expect(client.getQueryData(privateKey)).toEqual(["private-a"]);
	});

	it("cancels pending account reads before freezing the document", async () => {
		let signal: AbortSignal | undefined;
		const pending = client.fetchQuery({ queryKey: [...privateKey, "pending"], queryFn: (context) => {
			signal = context.signal;
			return new Promise(() => undefined);
		} }).catch(() => undefined);
		browser.dispatchEvent(new Event("pagehide"));
		expect(signal?.aborted).toBe(true);
		await pending;
	});

	it("unsubscribes both handlers", () => {
		stop();
		browser.dispatchEvent(new Event("pagehide"));
		show(true);
		expect(hide).not.toHaveBeenCalled();
		expect(reload).not.toHaveBeenCalled();
	});

	it("uses synchronous display:none!important so descendants cannot override the mask", () => {
		const setProperty = jest.fn();
		Object.defineProperty(globalThis, "document", { configurable: true, value: { documentElement: { style: { setProperty } } } });
		hideDocumentForSessionReset();
		expect(setProperty).toHaveBeenCalledWith("display", "none", "important");
	});
});
