import { QueryObserver } from "@tanstack/react-query";
import { createWebQueryClient } from "./queryClient";
import { WEB_QUERY_POLICIES } from "./policies";
import { webQueryKeys } from "./queryKeys";

const FIFTEEN_MINUTES = 15 * 60_000;
const queryKey = webQueryKeys.public.modelPricing("public/model");

describe("public query freshness", () => {
	let client: ReturnType<typeof createWebQueryClient>;
	beforeEach(() => { jest.useFakeTimers(); client = createWebQueryClient(); });
	afterEach(() => { client.clear(); jest.useRealTimers(); });

	it("shares fifteen-minute freshness, retention and visible polling", () => {
		for (const policy of [WEB_QUERY_POLICIES.public, WEB_QUERY_POLICIES.publicNoPolling]) {
			expect(policy.staleTime).toBe(FIFTEEN_MINUTES);
			expect(policy.gcTime).toBeGreaterThanOrEqual(FIFTEEN_MINUTES);
			expect(policy.refetchIntervalInBackground).toBe(false);
		}
		expect(WEB_QUERY_POLICIES.public.refetchInterval).toBe(FIFTEEN_MINUTES);
		expect(WEB_QUERY_POLICIES.publicNoPolling.refetchInterval).toBe(false);
	});

	it("reuses data before expiry and revalidates at fifteen minutes", async () => {
		const queryFn = jest.fn(async () => ["pricing"]);
		await client.fetchQuery({ queryKey, queryFn });
		jest.advanceTimersByTime(FIFTEEN_MINUTES - 1);
		await client.fetchQuery({ queryKey, queryFn });
		expect(queryFn).toHaveBeenCalledTimes(1);
		jest.advanceTimersByTime(1);
		await client.fetchQuery({ queryKey, queryFn });
		expect(queryFn).toHaveBeenCalledTimes(2);
	});

	it("does not refetch fresh data on mount/focus but does after expiry", async () => {
		const queryFn = jest.fn(async () => ["pricing"]);
		await client.fetchQuery({ queryKey, queryFn });
		const observer = new QueryObserver(client, { queryKey, queryFn });
		const stop = observer.subscribe(() => undefined);
		try {
			client.getQueryCache().onFocus();
			expect(queryFn).toHaveBeenCalledTimes(1);
			jest.advanceTimersByTime(FIFTEEN_MINUTES);
			client.getQueryCache().onFocus();
			await client.fetchQuery({ queryKey, queryFn });
			expect(queryFn).toHaveBeenCalledTimes(2);
		} finally { stop(); observer.destroy(); }
	});

	it("manual refetch and targeted invalidation still bypass freshness", async () => {
		const queryFn = jest.fn(async () => ["updated"]);
		client.setQueryData(queryKey, ["old"]);
		const otherKey = webQueryKeys.public.search();
		client.setQueryData(otherKey, ["index"]);
		const observer = new QueryObserver(client, { queryKey, queryFn });
		const stop = observer.subscribe(() => undefined);
		try {
			expect(queryFn).not.toHaveBeenCalled();
			await observer.refetch();
			await client.invalidateQueries({ queryKey });
			expect(queryFn).toHaveBeenCalledTimes(2);
			expect(client.getQueryData(queryKey)).toEqual(["updated"]);
			expect(client.getQueryState(otherKey)?.isInvalidated).toBe(false);
		} finally { stop(); observer.destroy(); }
	});

	it("polls visible queries at fifteen minutes, not five, and skips hidden tabs", async () => {
		const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
		const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
		let visibility = "visible";
		Object.defineProperty(globalThis, "window", { configurable: true, value: new EventTarget() });
		Object.defineProperty(globalThis, "document", { configurable: true, value: { get visibilityState() { return visibility; } } });
		const queryFn = jest.fn(async () => ["pricing"]);
		let dispose = () => {};
		try {
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
			await jest.advanceTimersByTimeAsync(FIFTEEN_MINUTES - 1);
			expect(queryFn).toHaveBeenCalledTimes(1);
			await jest.advanceTimersByTimeAsync(1);
			expect(queryFn).toHaveBeenCalledTimes(2);
			visibility = "hidden";
			await jest.advanceTimersByTimeAsync(FIFTEEN_MINUTES);
			expect(queryFn).toHaveBeenCalledTimes(2);
		} finally {
			dispose();
			for (const [key, descriptor] of [["window", originalWindow], ["document", originalDocument]] as const) {
				if (descriptor) Object.defineProperty(globalThis, key, descriptor);
				else Reflect.deleteProperty(globalThis, key);
			}
		}
	});
});
