import { QueryObserver } from "@tanstack/react-query";
import { createWebQueryClient } from "./queryClient";
import { privateUsageOptions, readUsageSearchParams, usageSearchParams } from "./privateUsage";
import { clearAccountQueryCache, invalidateAccountQueries } from "./invalidation";

const scope = { userId: "user-a", workspaceId: "workspace-a" };
const params = { usage_preset: "past_hour", model: "model-a" };
const fiveMinutes = 300_000;

describe("private usage cache", () => {
	let client: ReturnType<typeof createWebQueryClient>;
	beforeEach(() => { jest.useFakeTimers(); client = createWebQueryClient(); });
	afterEach(() => { client.clear(); jest.useRealTimers(); });

	it.each(["logs", "observability", "geography", "realtime", "request-page", "request-detail"])("reuses %s on return, then refetches after five minutes", async (resource) => {
		const queryFn = jest.fn(async () => ({ rows: ["private"], fetchedAt: Date.now() }));
		const options = { ...privateUsageOptions(scope, resource, params), queryFn };
		const first = await client.fetchQuery(options);
		jest.advanceTimersByTime(fiveMinutes - 1);
		expect(await client.fetchQuery(options)).toEqual(first);
		expect(queryFn).toHaveBeenCalledTimes(1);
		jest.advanceTimersByTime(1);
		await client.fetchQuery(options);
		expect(queryFn).toHaveBeenCalledTimes(2);
	});

	it("keeps users, workspaces, filters, pagination and Live isolated", () => {
		const keys = [
			privateUsageOptions(scope, "logs", params),
			privateUsageOptions({ ...scope, userId: "user-b" }, "logs", params),
			privateUsageOptions({ ...scope, workspaceId: "workspace-b" }, "logs", params),
			privateUsageOptions(scope, "logs", { ...params, model: "model-b" }),
			privateUsageOptions(scope, "logs", { ...params, page: "2" }),
			privateUsageOptions(scope, "logs", params, true),
		].map(({ queryKey }) => JSON.stringify(queryKey));
		expect(new Set(keys).size).toBe(keys.length);
	});

	it("Live never treats a prior result as fresh and discards inactive data", async () => {
		const queryFn = jest.fn(async () => ["live"]);
		const options = { ...privateUsageOptions(scope, "logs", params, true), queryFn };
		expect(options.staleTime).toBe(0);
		expect(options.refetchOnMount).toBe("always");
		expect(options.refetchInterval).toBe(15_000);
		await client.fetchQuery(options);
		await client.fetchQuery(options);
		expect(queryFn).toHaveBeenCalledTimes(2);
		jest.advanceTimersByTime(1);
		expect(client.getQueryData(options.queryKey)).toBeUndefined();
	});

	it("manual refresh and mutation invalidation bypass five-minute freshness", async () => {
		const queryFn = jest.fn(async () => ["private"]);
		const options = { ...privateUsageOptions(scope, "logs", params), queryFn };
		await client.fetchQuery(options);
		const observer = new QueryObserver(client, options);
		const stop = observer.subscribe(() => undefined);
		try {
			await observer.refetch();
			await invalidateAccountQueries(client);
			expect(queryFn).toHaveBeenCalledTimes(3);
		} finally { stop(); observer.destroy(); }
	});

	it("sign-out removes normal and Live data and cancels an in-flight response", async () => {
		const normal = privateUsageOptions(scope, "logs", params);
		client.setQueryData(normal.queryKey, ["private"]);
		const live = privateUsageOptions(scope, "logs", params, true);
		let finish!: (value: string[]) => void;
		let signal!: AbortSignal;
		const pending = client.fetchQuery({ ...live, queryFn: (context) => {
			signal = context.signal;
			return new Promise<string[]>((resolve) => { finish = resolve; });
		} }).catch(() => undefined);
		clearAccountQueryCache(client);
		finish(["old-user"]);
		await pending;
		expect(signal.aborted).toBe(true);
		expect(client.getQueryData(normal.queryKey)).toBeUndefined();
		expect(client.getQueryData(live.queryKey)).toBeUndefined();
	});

	it("canonicalizes parameter order without dropping repeated filters", () => {
		const parsed = readUsageSearchParams(new URLSearchParams("model=a&model=b&usage_preset=live"));
		expect(parsed.model).toEqual(["a", "b"]);
		expect(usageSearchParams(parsed).getAll("model")).toEqual(["a", "b"]);
		expect(privateUsageOptions(scope, "logs", { b: "2", a: "1" }).queryKey).toEqual(privateUsageOptions(scope, "logs", { a: "1", b: "2" }).queryKey);
	});

	it("polls Live every 15 seconds, pauses when hidden, and stops after leaving Live", async () => {
		const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
		const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
		let visibility = "visible";
		Object.defineProperty(globalThis, "window", { configurable: true, value: new EventTarget() });
		Object.defineProperty(globalThis, "document", { configurable: true, value: { get visibilityState() { return visibility; } } });
		const queryFn = jest.fn(async () => ["fresh"]);
		let stopLive = () => {};
		let dispose = () => {};
		try {
			jest.isolateModules(() => {
				// eslint-disable-next-line @typescript-eslint/no-require-imports
				const { QueryClient, QueryObserver: BrowserObserver } = require("@tanstack/react-query") as typeof import("@tanstack/react-query");
				const browserClient = new QueryClient();
				const observer = new BrowserObserver(browserClient, { ...privateUsageOptions(scope, "logs", params, true), queryFn });
				stopLive = observer.subscribe(() => undefined);
				dispose = () => { observer.destroy(); browserClient.clear(); };
			});
			await jest.advanceTimersByTimeAsync(0);
			expect(queryFn).toHaveBeenCalledTimes(1);
			await jest.advanceTimersByTimeAsync(14_999);
			expect(queryFn).toHaveBeenCalledTimes(1);
			await jest.advanceTimersByTimeAsync(1);
			expect(queryFn).toHaveBeenCalledTimes(2);
			visibility = "hidden";
			await jest.advanceTimersByTimeAsync(15_000);
			expect(queryFn).toHaveBeenCalledTimes(2);
			visibility = "visible";
			await jest.advanceTimersByTimeAsync(15_000);
			expect(queryFn).toHaveBeenCalledTimes(3);
			stopLive();
			await jest.advanceTimersByTimeAsync(30_000);
			expect(queryFn).toHaveBeenCalledTimes(3);
		} finally {
			stopLive(); dispose();
			for (const [key, descriptor] of [["window", originalWindow], ["document", originalDocument]] as const) {
				if (descriptor) Object.defineProperty(globalThis, key, descriptor);
				else Reflect.deleteProperty(globalThis, key);
			}
		}
	});
});
