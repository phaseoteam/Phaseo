import { withServerDeadline } from "./serverDeadline";
import { createWebQueryClient } from "./queryClient";
import { webQueryKeys } from "./queryKeys";

describe("server data loading deadline", () => {
	beforeEach(() => jest.useFakeTimers());
	afterEach(() => jest.useRealTimers());

	it("returns completed data and releases the timer", async () => {
		await expect(withServerDeadline(async () => "data", 100)).resolves.toBe("data");
		expect(jest.getTimerCount()).toBe(0);
	});

	it("bounds work that ignores cancellation", async () => {
		const result = withServerDeadline(() => new Promise(() => {}), 100);
		const rejection = expect(result).rejects.toMatchObject({ name: "TimeoutError" });
		await jest.advanceTimersByTimeAsync(100);
		await rejection;
		expect(jest.getTimerCount()).toBe(0);
	});

	it("shares one deadline across sequential requests and aborts the active request", async () => {
		let signal: AbortSignal | undefined;
		const result = withServerDeadline(async (deadline) => {
			signal = deadline;
			await new Promise((resolve) => setTimeout(resolve, 60));
			await new Promise((_, reject) => deadline.addEventListener("abort", () => reject(deadline.reason), { once: true }));
		}, 100);
		const rejection = expect(result).rejects.toMatchObject({ name: "TimeoutError" });
		await jest.advanceTimersByTimeAsync(99);
		expect(signal?.aborted).toBe(false);
		await jest.advanceTimersByTimeAsync(1);
		await rejection;
		expect(signal?.aborted).toBe(true);
	});

	it("does not retry a failed account catalogue prefetch", async () => {
		const client = createWebQueryClient();
		const queryFn = jest.fn().mockRejectedValue(new Error("Unavailable"));
		await client.prefetchQuery({
			queryKey: webQueryKeys.account.catalogue({ scope: { userId: "user", workspaceId: "workspace" }, catalogueVersion: "v2", previewCacheScope: "public" }),
			queryFn,
			retry: false,
		});
		expect(queryFn).toHaveBeenCalledTimes(1);
		client.clear();
	});

	it("propagates normal failures and releases the deadline timer", async () => {
		const error = new Error("Failure");
		await expect(withServerDeadline(async () => { throw error; })).rejects.toBe(error);
		expect(jest.getTimerCount()).toBe(0);
	});
});
