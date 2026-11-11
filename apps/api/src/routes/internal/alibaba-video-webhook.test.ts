import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ find: vi.fn(), finalize: vi.fn(), dispatch: vi.fn(), processed: vi.fn() }));
vi.mock("@core/video-jobs", () => ({ findVideoJobRecordByNativeId: mocks.find }));
vi.mock("@core/video-finalization", () => ({ finalizeVideoJob: mocks.finalize }));
vi.mock("@core/video-user-webhooks", () => ({ dispatchVideoWebhookEventInBackground: mocks.dispatch }));
vi.mock("@core/provider-events", () => ({ markProviderEventProcessed: mocks.processed }));
import { processAlibabaVideoWebhook } from "./video-webhooks.helpers";

const succeeded = (usage: Record<string, unknown>) => ({
	data: { task_status: "SUCCEEDED", usage, output: { video_url: "https://example.com/v.mp4" } },
});

beforeEach(() => {
	vi.resetAllMocks();
	mocks.finalize.mockImplementation(async ({ status }) => ({ status }));
});

describe("Alibaba video webhooks", () => {
	it("bills a smart-duration job by the reported output length, not the 30 s hold", async () => {
		mocks.find.mockResolvedValue({ workspaceId: "ws", videoId: "v1", model: "wan3.0-video", meta: { seconds: 30, autoDuration: true } });
		await processAlibabaVideoWebhook({ eventId: "e1", eventType: "task.succeeded", taskId: "t1", payload: succeeded({ output_video_duration: 12, duration: 27 }) });
		expect(mocks.finalize).toHaveBeenCalledWith(expect.objectContaining({ status: "completed", seconds: 12 }));
	});

	it("keeps the reported duration for fixed-length jobs", async () => {
		mocks.find.mockResolvedValue({ workspaceId: "ws", videoId: "v2", model: "wan3.0-video", meta: { seconds: 5 } });
		await processAlibabaVideoWebhook({ eventId: "e2", eventType: "task.succeeded", taskId: "t2", payload: { data: { task_status: "SUCCEEDED", duration: 5 } } });
		expect(mocks.finalize).toHaveBeenCalledWith(expect.objectContaining({ seconds: 5 }));
	});
});
