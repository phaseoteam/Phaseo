import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutorExecuteArgs } from "@executors/types";
const mocks = vi.hoisted(() => ({ save: vi.fn(), fetch: vi.fn() }));
vi.mock("@core/video-jobs", () => ({ saveVideoJobMeta: mocks.save }));
vi.mock("./timing/upstream", () => ({ fetchUpstream: mocks.fetch }));
import { configureVideoSubmission, canReleaseVideoSubmission, fetchVideoSubmission, rejectVideoSubmission } from "./video-submission";

describe("durable video submission boundary", () => {
	let args: ExecutorExecuteArgs;
	beforeEach(() => {
		vi.resetAllMocks();
		args = { workspaceId: "ws", requestId: "video", providerId: "minimax", meta: {}, ir: { model: "MiniMax-Hailuo-02", prompt: "test", seconds: 6 } } as ExecutorExecuteArgs;
		configureVideoSubmission(args, { reservationId: "hold", reservedNanos: 100 });
	});
	it("persists the reservation and job before a paid network call", async () => {
		mocks.fetch.mockImplementation(async () => {
			expect(mocks.save).toHaveBeenCalledWith("ws", "video", expect.objectContaining({ submissionState: "submitting", reservationId: "hold" }), null, "pending");
			return new Response('{"task_id":"native"}');
		});
		await fetchVideoSubmission(args, "https://provider.test/create", { method: "POST" });
		expect(canReleaseVideoSubmission(args)).toBe(false);
	});
	it("does not dispatch when persistence fails and permits releasing the hold", async () => {
		mocks.save.mockRejectedValue(new Error("database unavailable"));
		await expect(fetchVideoSubmission(args, "https://provider.test/create")).rejects.toThrow("database unavailable");
		expect(mocks.fetch).not.toHaveBeenCalled();
		expect(canReleaseVideoSubmission(args)).toBe(true);
	});
	it.each([200, 408, 500, 502, 503])("retains the hold for an ambiguous HTTP %s outcome", async (status) => {
		mocks.fetch.mockResolvedValue(new Response("{}", { status }));
		await fetchVideoSubmission(args, "https://provider.test/create");
		expect(canReleaseVideoSubmission(args)).toBe(false);
		expect(mocks.save).toHaveBeenCalledTimes(1);
	});
	it("retains the hold after transport failure", async () => {
		mocks.fetch.mockRejectedValue(new Error("timeout"));
		await expect(fetchVideoSubmission(args, "https://provider.test/create")).rejects.toThrow("timeout");
		expect(canReleaseVideoSubmission(args)).toBe(false);
	});
	it.each([400, 401, 402, 422, 429])("records a definitive HTTP %s rejection before releasing", async (status) => {
		mocks.fetch.mockResolvedValue(new Response("{}", { status }));
		await fetchVideoSubmission(args, "https://provider.test/create");
		expect(canReleaseVideoSubmission(args)).toBe(true);
		expect(mocks.save).toHaveBeenLastCalledWith("ws", "video", expect.objectContaining({ submissionState: "rejected" }), null, "failed");
	});
	it("records a provider-specific definitive application rejection", async () => {
		mocks.fetch.mockResolvedValue(new Response("{}"));
		await fetchVideoSubmission(args, "https://provider.test/create");
		await rejectVideoSubmission(args);
		expect(canReleaseVideoSubmission(args)).toBe(true);
	});
});
