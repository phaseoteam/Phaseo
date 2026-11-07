import { describe, expect, it, vi } from "vitest";
import { retryTransaction } from "./retry-transaction";

const deadlock = { data: null, error: { code: "40P01", message: "deadlock detected" } };
const serialization = { data: null, error: { code: "40001", message: "could not serialize access" } };
const ok = { data: { id: "row_1" }, error: null };

function harness(results: Array<{ data: unknown; error: { code: string; message: string } | null }>) {
	const run = vi.fn(async () => results.shift() ?? ok);
	const delays: number[] = [];
	const sleep = vi.fn(async (ms: number) => { delays.push(ms); });
	return { run, sleep, delays };
}

describe("retryTransaction", () => {
	it("runs the transaction again after a deadlock or serialization failure, then returns its result", async () => {
		const { run, sleep, delays } = harness([deadlock, serialization, ok]);
		await expect(retryTransaction(run, { sleep, random: () => 0.5 })).resolves.toEqual(ok);
		expect(run).toHaveBeenCalledTimes(3);
		// Exponential backoff with jitter: 25 ms then 50 ms, plus up to 25 ms.
		expect(delays).toEqual([37, 62]);
	});

	it("gives up after three attempts and returns the last error", async () => {
		const { run, sleep } = harness([deadlock, deadlock, deadlock, ok]);
		await expect(retryTransaction(run, { sleep })).resolves.toEqual(deadlock);
		expect(run).toHaveBeenCalledTimes(3);
		expect(sleep).toHaveBeenCalledTimes(2);
	});

	it("doesn't retry other errors or successes", async () => {
		const forbidden = { data: null, error: { code: "42501", message: "workspace_admin_owner_only" } };
		for (const result of [forbidden, ok]) {
			const { run, sleep } = harness([result]);
			await expect(retryTransaction(run, { sleep })).resolves.toEqual(result);
			expect(run).toHaveBeenCalledTimes(1);
			expect(sleep).not.toHaveBeenCalled();
		}
	});
});
