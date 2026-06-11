import { beforeEach, describe, expect, it, vi } from "vitest";

const getAsyncOperationMock = vi.fn();
const findAsyncOperationByNativeIdMock = vi.fn();
const isAsyncOperationBilledMock = vi.fn();
const listAsyncOperationsMock = vi.fn();
const listTeamAsyncOperationsMock = vi.fn();
const markAsyncOperationBilledMock = vi.fn();
const patchAsyncOperationMetaMock = vi.fn();
const setAsyncOperationStatusMock = vi.fn();
const upsertAsyncOperationMock = vi.fn();
const dispatchVideoWebhookEventInBackgroundMock = vi.fn();

vi.mock("@core/async-operations", () => ({
	findAsyncOperationByNativeId: (...args: unknown[]) => findAsyncOperationByNativeIdMock(...args),
	getAsyncOperation: (...args: unknown[]) => getAsyncOperationMock(...args),
	isAsyncOperationBilled: (...args: unknown[]) => isAsyncOperationBilledMock(...args),
	listAsyncOperations: (...args: unknown[]) => listAsyncOperationsMock(...args),
	listTeamAsyncOperations: (...args: unknown[]) => listTeamAsyncOperationsMock(...args),
	markAsyncOperationBilled: (...args: unknown[]) => markAsyncOperationBilledMock(...args),
	patchAsyncOperationMeta: (...args: unknown[]) => patchAsyncOperationMetaMock(...args),
	setAsyncOperationStatus: (...args: unknown[]) => setAsyncOperationStatusMock(...args),
	upsertAsyncOperation: (...args: unknown[]) => upsertAsyncOperationMock(...args),
}));

vi.mock("@core/video-user-webhooks", () => ({
	dispatchVideoWebhookEventInBackground: (...args: unknown[]) =>
		dispatchVideoWebhookEventInBackgroundMock(...args),
}));

import { getVideoJobMeta, isVideoJobBilled, listPendingVideoJobs, markVideoJobBilled, saveVideoJobMeta } from "./video-jobs";

describe("video-jobs", () => {
	beforeEach(() => {
		getAsyncOperationMock.mockReset();
		findAsyncOperationByNativeIdMock.mockReset();
		isAsyncOperationBilledMock.mockReset();
		listAsyncOperationsMock.mockReset();
		listTeamAsyncOperationsMock.mockReset();
		markAsyncOperationBilledMock.mockReset();
		patchAsyncOperationMetaMock.mockReset();
		setAsyncOperationStatusMock.mockReset();
		upsertAsyncOperationMock.mockReset();
		dispatchVideoWebhookEventInBackgroundMock.mockReset();
	});

	it("reads metadata from DB", async () => {
		getAsyncOperationMock.mockResolvedValue({
			workspaceId: "team_1",
			kind: "video",
			internalId: "vid_1",
			provider: "openai",
			nativeId: "vid_1",
			model: "sora-2",
			status: null,
			meta: { seconds: 5, quality: "low" },
			billedAt: null,
			createdAt: null,
			updatedAt: null,
		});

		const meta = await getVideoJobMeta("team_1", "vid_1");
		expect(meta).toEqual({
			provider: "openai",
			model: "sora-2",
			seconds: 5,
			quality: "low",
		});
	});

	it("normalizes snake_case reservation metadata from DB", async () => {
		getAsyncOperationMock.mockResolvedValue({
			workspaceId: "team_1",
			kind: "video",
			internalId: "vid_reserved",
			provider: "openai",
			nativeId: "vid_reserved",
			model: "sora-2",
			status: null,
			meta: {
				reservation_id: "video_hold:req_123",
				reserved_nanos: 150_000_000,
				reservation_status: "captured",
			},
			billedAt: null,
			createdAt: null,
			updatedAt: null,
		});

		const meta = await getVideoJobMeta("team_1", "vid_reserved");
		expect(meta).toMatchObject({
			provider: "openai",
			model: "sora-2",
			reservationId: "video_hold:req_123",
			reservedNanos: 150_000_000,
			reservationStatus: "captured",
		});
	});

	it("returns null when DB record is missing", async () => {
		getAsyncOperationMock.mockResolvedValue(null);
		const meta = await getVideoJobMeta("team_2", "gaiop_abc");
		expect(meta).toBeNull();
	});

	it("checks billed flag in DB", async () => {
		isAsyncOperationBilledMock.mockResolvedValue(true);

		const billed = await isVideoJobBilled("team_3", "vid_3");
		expect(billed).toBe(true);
	});

	it("marks billed state in DB", async () => {
		markAsyncOperationBilledMock.mockResolvedValue(true);

		await markVideoJobBilled("team_4", "vid_4");

		expect(markAsyncOperationBilledMock).toHaveBeenCalledWith("team_4", "video", "vid_4");
	});

	it("saves metadata to DB", async () => {
		upsertAsyncOperationMock.mockResolvedValue(undefined);

		await saveVideoJobMeta("team_5", "vid_5", {
			provider: "openai",
			model: "sora-2",
			seconds: 2,
			providerTaskId: "native_vid_5",
		}, "native_vid_5");

		expect(upsertAsyncOperationMock).toHaveBeenCalledWith(expect.objectContaining({
			workspaceId: "team_5",
			kind: "video",
			internalId: "vid_5",
			nativeId: "native_vid_5",
			provider: "openai",
			model: "sora-2",
		}));
	});

	it("persists async video job metadata before queueing created webhooks", async () => {
		upsertAsyncOperationMock.mockImplementation(async () => {
			expect(dispatchVideoWebhookEventInBackgroundMock).not.toHaveBeenCalled();
		});

		await saveVideoJobMeta("team_6", "vid_6", {
			provider: "openai",
			model: "sora-2",
			requestId: "req_vid_6",
			providerTaskId: "native_vid_6",
			webhook: {
				url: "https://example.com/hooks/video",
				events: ["video.created", "video.completed"],
			},
		}, "native_vid_6", "in_progress");

		await vi.waitFor(() => {
			expect(dispatchVideoWebhookEventInBackgroundMock).toHaveBeenCalledWith({
				workspaceId: "team_6",
				videoId: "vid_6",
				eventType: "video.created",
			});
		});
		expect(upsertAsyncOperationMock).toHaveBeenCalledWith(expect.objectContaining({
			workspaceId: "team_6",
			kind: "video",
			internalId: "vid_6",
			requestId: "req_vid_6",
			nativeId: "native_vid_6",
			status: "in_progress",
			meta: expect.objectContaining({
				provider: "openai",
				providerTaskId: "native_vid_6",
				webhook: {
					url: "https://example.com/hooks/video",
					events: ["video.created", "video.completed"],
				},
			}),
		}));
	});

	it("does not queue created webhooks for terminal video records", async () => {
		upsertAsyncOperationMock.mockResolvedValue(undefined);

		await saveVideoJobMeta("team_7", "vid_7", {
			provider: "openai",
			model: "sora-2",
			webhook: {
				url: "https://example.com/hooks/video",
				events: ["video.created", "video.completed"],
			},
		}, "native_vid_7", "completed");

		await Promise.resolve();
		expect(dispatchVideoWebhookEventInBackgroundMock).not.toHaveBeenCalled();
	});

	it("includes unbilled cancelled and expired terminal jobs for reconciliation cleanup", async () => {
		listAsyncOperationsMock.mockResolvedValue([
			{
				workspaceId: "team_1",
				kind: "video",
				internalId: "vid_cancelled",
				requestId: "req_cancelled",
				sessionId: null,
				appId: null,
				nativeId: "native_cancelled",
				provider: "runway",
				model: "runway/gen4_turbo",
				status: "cancelled",
				billedAt: null,
				meta: { provider: "runway" },
				updatedAt: null,
				createdAt: null,
			},
			{
				workspaceId: "team_1",
				kind: "video",
				internalId: "vid_expired",
				requestId: "req_expired",
				sessionId: null,
				appId: null,
				nativeId: "native_expired",
				provider: "x-ai",
				model: "x-ai/grok-imagine-video",
				status: "expired",
				billedAt: null,
				meta: { provider: "x-ai" },
				updatedAt: null,
				createdAt: null,
			},
			{
				workspaceId: "team_1",
				kind: "video",
				internalId: "vid_deleted",
				requestId: "req_deleted",
				sessionId: null,
				appId: null,
				nativeId: "native_deleted",
				provider: "openai",
				model: "sora-2",
				status: "deleted",
				billedAt: null,
				meta: { provider: "openai" },
				updatedAt: null,
				createdAt: null,
			},
		]);

		const jobs = await listPendingVideoJobs(25);

		expect(listAsyncOperationsMock).toHaveBeenCalledWith({
			kind: "video",
			limit: 25,
			unbilledOnly: true,
		});
		expect(jobs.map((job) => job.videoId)).toEqual(["vid_cancelled", "vid_expired"]);
	});
});
