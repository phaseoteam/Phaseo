import { QueryObserver } from "@tanstack/react-query";
import { createWebQueryClient } from "./queryClient";
import { WEB_QUERY_POLICIES } from "./policies";
import { webQueryKeys } from "./queryKeys";
import { clearAccountQueryCache, invalidateAccountQueries } from "./invalidation";

const FIVE_MINUTES = 5 * 60_000;
const scope = { userId: "user-a", workspaceId: "workspace-a" };
const queryKey = webQueryKeys.account.privateModels({ scope, shape: "page" });

describe("private query freshness", () => {
	let client: ReturnType<typeof createWebQueryClient>;
	beforeEach(() => { jest.useFakeTimers(); client = createWebQueryClient(); });
	afterEach(() => { client.clear(); jest.useRealTimers(); });

	it("uses five-minute freshness and visible polling for both private policies", () => {
		for (const policy of [WEB_QUERY_POLICIES.private, WEB_QUERY_POLICIES.privateNoRetry]) {
			expect(policy.staleTime).toBe(FIVE_MINUTES);
			expect(policy.refetchInterval).toBe(FIVE_MINUTES);
			expect(policy.refetchIntervalInBackground).toBe(false);
		}
		expect(client.getQueryDefaults(webQueryKeys.account.all()).staleTime).toBe(FIVE_MINUTES);
		expect(WEB_QUERY_POLICIES.public.staleTime).toBe(15 * 60_000);
	});

	it("reuses private data before five minutes and revalidates at expiry", async () => {
		const queryFn = jest.fn(async () => ["private"]);
		await client.fetchQuery({ queryKey, queryFn });
		jest.advanceTimersByTime(FIVE_MINUTES - 1);
		await client.fetchQuery({ queryKey, queryFn });
		expect(queryFn).toHaveBeenCalledTimes(1);
		jest.advanceTimersByTime(1);
		await client.fetchQuery({ queryKey, queryFn });
		expect(queryFn).toHaveBeenCalledTimes(2);
	});

	it("does not revalidate fresh data on mount or focus, but does after expiry", async () => {
		const queryFn = jest.fn(async () => ["private"]);
		await client.fetchQuery({ queryKey, queryFn });
		const observer = new QueryObserver(client, { queryKey, queryFn });
		const stop = observer.subscribe(() => undefined);
		try {
			client.getQueryCache().onFocus();
			expect(queryFn).toHaveBeenCalledTimes(1);
			jest.advanceTimersByTime(FIVE_MINUTES);
			client.getQueryCache().onFocus();
			await client.fetchQuery({ queryKey, queryFn });
			expect(queryFn).toHaveBeenCalledTimes(2);
		} finally { stop(); observer.destroy(); }
	});

	it("manual refresh bypasses freshness immediately", async () => {
		const queryFn = jest.fn(async () => ["private"]);
		await client.fetchQuery({ queryKey, queryFn });
		const observer = new QueryObserver(client, { queryKey, queryFn });
		try {
			await observer.refetch();
			expect(queryFn).toHaveBeenCalledTimes(2);
		} finally { observer.destroy(); }
	});

	it("mutation invalidation refreshes active data and marks inactive data stale immediately", async () => {
		const queryFn = jest.fn(async () => ["updated"]);
		const inactiveKey = webQueryKeys.account.providerPreviews({ scope });
		const publicKey = webQueryKeys.public.search();
		client.setQueryData(queryKey, ["old"]);
		client.setQueryData(inactiveKey, ["old preview"]);
		client.setQueryData(publicKey, ["public"]);
		const observer = new QueryObserver(client, { queryKey, queryFn });
		const stop = observer.subscribe(() => undefined);
		try {
			expect(queryFn).not.toHaveBeenCalled();
			await invalidateAccountQueries(client);
			expect(queryFn).toHaveBeenCalledTimes(1);
			expect(client.getQueryData(queryKey)).toEqual(["updated"]);
			expect(client.getQueryState(inactiveKey)?.isInvalidated).toBe(true);
			expect(client.getQueryState(publicKey)?.isInvalidated).toBe(false);
		} finally { stop(); observer.destroy(); }
	});

	it("sign-out removes private data even while it is still fresh", () => {
		client.setQueryData(queryKey, ["private"]);
		clearAccountQueryCache(client);
		expect(client.getQueryData(queryKey)).toBeUndefined();
	});

	it("actually polls at five minutes in a visible browser and skips hidden-tab polls", async () => {
		const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
		const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
		let visibility = "visible";
		Object.defineProperty(globalThis, "window", { configurable: true, value: new EventTarget() });
		Object.defineProperty(globalThis, "document", { configurable: true, value: { get visibilityState() { return visibility; } } });
		const queryFn = jest.fn(async () => ["private"]);
		let dispose = () => {};
		try {
			// Load a fresh Query core with browser timers enabled, without a DOM dependency.
			jest.isolateModules(() => {
				// eslint-disable-next-line @typescript-eslint/no-require-imports
				const { QueryObserver: BrowserObserver } = require("@tanstack/react-query") as typeof import("@tanstack/react-query");
				// eslint-disable-next-line @typescript-eslint/no-require-imports
				const { createWebQueryClient: createBrowserClient } = require("./queryClient") as typeof import("./queryClient");
				const browserClient = createBrowserClient();
				const observer = new BrowserObserver(browserClient, { queryKey, queryFn });
				const stop = observer.subscribe(() => undefined);
				dispose = () => { stop(); observer.destroy(); browserClient.clear(); };
			});
			await jest.advanceTimersByTimeAsync(0);
			expect(queryFn).toHaveBeenCalledTimes(1);
			await jest.advanceTimersByTimeAsync(FIVE_MINUTES - 1);
			expect(queryFn).toHaveBeenCalledTimes(1);
			await jest.advanceTimersByTimeAsync(1);
			expect(queryFn).toHaveBeenCalledTimes(2);
			visibility = "hidden";
			await jest.advanceTimersByTimeAsync(FIVE_MINUTES);
			expect(queryFn).toHaveBeenCalledTimes(2);
			visibility = "visible";
			await jest.advanceTimersByTimeAsync(FIVE_MINUTES);
			expect(queryFn).toHaveBeenCalledTimes(3);
		} finally {
			dispose();
			for (const [key, descriptor] of [["window", originalWindow], ["document", originalDocument]] as const) {
				if (descriptor) Object.defineProperty(globalThis, key, descriptor);
				else Reflect.deleteProperty(globalThis, key);
			}
		}
	});
});
