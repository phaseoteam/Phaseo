import { dehydrate, hydrate, QueryObserver } from "@tanstack/react-query";
import { createWebQueryClient } from "./queryClient";
import { clearAccountQueryCache, clearAccountQueryScope } from "./invalidation";
import { webQueryKeys } from "./queryKeys";

const scopeA = { userId: "user-a", workspaceId: "workspace-a" };
const scopeB = { userId: "user-b", workspaceId: "workspace-b" };
const keyA = webQueryKeys.account.privateModels({ scope: scopeA, shape: "page" });
const keyB = webQueryKeys.account.privateModels({ scope: scopeB, shape: "page" });

describe("query cache isolation with the real QueryClient", () => {
	const clients: ReturnType<typeof createWebQueryClient>[] = [];
	function client() {
		const value = createWebQueryClient();
		clients.push(value);
		return value;
	}
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => {
		clients.splice(0).forEach((value) => value.clear());
		jest.useRealTimers();
	});

	it("isolates SSR clients and hydrates only the intended account key", async () => {
		const first = client();
		const second = client();
		await first.fetchQuery({ queryKey: keyA, queryFn: async () => ["private-a"] });
		expect(second.getQueryData(keyA)).toBeUndefined();
		const browser = client();
		hydrate(browser, dehydrate(first));
		expect(browser.getQueryData(keyA)).toEqual(["private-a"]);
		expect(browser.getQueryData(keyB)).toBeUndefined();
	});

	it("does not show the previous account when an observer changes scope", () => {
		const cache = client();
		cache.setQueryData(keyA, ["private-a"]);
		const observer = new QueryObserver(cache, { queryKey: keyA, enabled: false });
		expect(observer.getCurrentResult().data).toEqual(["private-a"]);
		observer.setOptions({ queryKey: keyB, enabled: false });
		expect(observer.getCurrentResult().data).toBeUndefined();
		observer.destroy();
	});

	it("clears one scope without deleting public data or another account", () => {
		const cache = client();
		cache.setQueryData(keyA, ["private-a"]);
		cache.setQueryData(keyB, ["private-b"]);
		cache.setQueryData(webQueryKeys.public.search(), ["public"]);
		clearAccountQueryScope(cache, scopeA);
		expect(cache.getQueryData(keyA)).toBeUndefined();
		expect(cache.getQueryData(keyB)).toEqual(["private-b"]);
		expect(cache.getQueryData(webQueryKeys.public.search())).toEqual(["public"]);
		clearAccountQueryCache(cache);
		expect(cache.getQueryData(keyB)).toBeUndefined();
		expect(cache.getQueryData(webQueryKeys.public.search())).toEqual(["public"]);
	});

	it("aborts private requests on clearing and ignores a late response", async () => {
		const cache = client();
		let requestSignal: AbortSignal | undefined;
		let finish!: (value: string[]) => void;
		const pending = cache.fetchQuery({
			queryKey: keyA,
			queryFn: ({ signal }) => {
				requestSignal = signal;
				return new Promise<string[]>((resolve) => { finish = resolve; });
			},
		}).catch(() => undefined);
		clearAccountQueryCache(cache);
		expect(requestSignal?.aborted).toBe(true);
		finish(["late-private-a"]);
		await pending;
		expect(cache.getQueryData(keyA)).toBeUndefined();
	});
});
