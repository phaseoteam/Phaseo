import { defaultShouldDehydrateQuery, dehydrate, hydrate, QueryObserver } from "@tanstack/react-query";
import { createWebQueryClient } from "./queryClient";
import { ANONYMOUS_ACCOUNT_QUERY_SCOPE, webQueryKeys } from "./queryKeys";

it.each(["TimeoutError", "Error"])("recovers a failed streamed %s prefetch through the browser query", async (name) => {
	jest.useFakeTimers();
	const server = createWebQueryClient();
	const browser = createWebQueryClient();
	const queryKey = webQueryKeys.account.catalogue({
		scope: ANONYMOUS_ACCOUNT_QUERY_SCOPE, catalogueVersion: "v2", previewCacheScope: "public",
	});
	let rejectServer!: (error: Error) => void;
	const waiting = new Promise((_, reject) => { rejectServer = reject; });
	const prefetch = server.prefetchQuery({ queryKey, queryFn: () => waiting, retry: false });
	hydrate(browser, dehydrate(server, {
		shouldDehydrateQuery: (query) => query.state.status === "pending",
		shouldRedactErrors: () => false,
	}));
	const recovered = { models: [{ model_id: "recovered/model" }] };
	const queryFn = jest.fn(async () => recovered);
	const observer = new QueryObserver(browser, { queryKey, queryFn });
	const unsubscribe = observer.subscribe(() => {});
	const recovery = browser.getQueryCache().find({ queryKey })!.promise;
	try {
		// Dehydration does not transfer the server's retry:false option. Browser
		// defaults retry with the observer's real query function after rejection.
		expect(browser.getQueryCache().find({ queryKey })!.options.retry).not.toBe(false);
		rejectServer(Object.assign(new Error("Server request failed"), { name }));
		await prefetch;
		await jest.advanceTimersByTimeAsync(1_001);
		await expect(recovery).resolves.toEqual(recovered);
		expect(queryFn).toHaveBeenCalledTimes(1);
		expect(observer.getCurrentResult().isError).toBe(false);
	} finally {
		unsubscribe(); server.clear(); browser.clear(); jest.useRealTimers();
	}
});

it("keeps cached models visible while a streamed navigation prefetch is pending", async () => {
	jest.useFakeTimers();
	const server = createWebQueryClient();
	const browser = createWebQueryClient();
	const queryKey = webQueryKeys.account.catalogue({
		scope: ANONYMOUS_ACCOUNT_QUERY_SCOPE, catalogueVersion: "v2", previewCacheScope: "public",
	});
	const cached = { models: [{ model_id: "cached/model" }] };
	const refreshed = { models: [{ model_id: "refreshed/model" }] };
	let finish!: (value: typeof cached) => void;
	const waiting = new Promise<typeof cached>((resolve) => { finish = resolve; });
	const prefetch = server.prefetchQuery({ queryKey, queryFn: () => waiting });
	browser.setQueryData(queryKey, cached);
	hydrate(browser, dehydrate(server, {
		shouldDehydrateQuery: (query) => defaultShouldDehydrateQuery(query) || query.state.status === "pending",
	}));
	const observer = new QueryObserver(browser, { queryKey, queryFn: () => waiting });
	expect(observer.getCurrentResult().data).toEqual(cached);
	expect(observer.getCurrentResult().isPending).toBe(false);
	finish(refreshed);
	await prefetch;
	// Fresh browser data can be newer than the server's pending query. Hydration
	// must preserve it instead of forcing a replacement or a loading state.
	expect(observer.getCurrentResult().isPending).toBe(false);
	server.clear();
	browser.clear();
	jest.useRealTimers();
});
