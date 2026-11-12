import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn(async (_name: string, _args: any) => ({ error: null })));
vi.mock("@/runtime/env", () => ({ getSupabaseAdmin: () => ({ rpc }) }));

import { BroadcastHealthRecorder } from "./broadcast-health";

describe("BroadcastHealthRecorder", () => {
	beforeEach(() => rpc.mockClear());

	it("replays concurrent requests in start order", async () => {
		const health = new BroadcastHealthRecorder();
		// The request that started first failed, but finished after a later success.
		health.request("dest_1", { delivered: true, status: 200, error: null }, 2_000);
		health.request("dest_1", { delivered: false, status: 503, error: "unavailable" }, 1_000);
		health.event("dest_1", true);
		await health.flush();

		expect(rpc).toHaveBeenCalledWith("record_broadcast_destination_health", {
			p_results: [{
				destination_id: "dest_1",
				delivered: 1,
				failed: 0,
				failures: 0,
				last_success_at: new Date(2_000).toISOString(),
				last_failure_at: new Date(1_000).toISOString(),
				last_http_status: 503,
				last_error: "unavailable",
			}],
		});
	});

	it("counts failures after the latest success as the streak", async () => {
		const health = new BroadcastHealthRecorder();
		health.request("dest_1", { delivered: false, status: 500, error: "first" }, 3_000);
		health.request("dest_1", { delivered: true, status: 200, error: null }, 1_000);
		health.request("dest_1", { delivered: false, status: 502, error: "second" }, 4_000);
		await health.flush();

		expect(rpc.mock.calls[0][1].p_results[0]).toMatchObject({
			failures: 2,
			last_success_at: new Date(1_000).toISOString(),
			last_failure_at: new Date(4_000).toISOString(),
			last_http_status: 502,
			last_error: "second",
		});
	});
});
