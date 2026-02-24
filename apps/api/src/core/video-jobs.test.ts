import { beforeEach, describe, expect, it, vi } from "vitest";

const getAsyncOperationMock = vi.fn();
const isAsyncOperationBilledMock = vi.fn();
const markAsyncOperationBilledMock = vi.fn();
const upsertAsyncOperationMock = vi.fn();

vi.mock("@core/async-operations", () => ({
	getAsyncOperation: (...args: unknown[]) => getAsyncOperationMock(...args),
	isAsyncOperationBilled: (...args: unknown[]) => isAsyncOperationBilledMock(...args),
	markAsyncOperationBilled: (...args: unknown[]) => markAsyncOperationBilledMock(...args),
	upsertAsyncOperation: (...args: unknown[]) => upsertAsyncOperationMock(...args),
}));

import { getVideoJobMeta, isVideoJobBilled, markVideoJobBilled, saveVideoJobMeta } from "./video-jobs";

describe("video-jobs", () => {
	beforeEach(() => {
		getAsyncOperationMock.mockReset();
		isAsyncOperationBilledMock.mockReset();
		markAsyncOperationBilledMock.mockReset();
		upsertAsyncOperationMock.mockReset();
	});

	it("reads metadata from DB", async () => {
		getAsyncOperationMock.mockResolvedValue({
			teamId: "team_1",
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
		});

		expect(upsertAsyncOperationMock).toHaveBeenCalledWith(expect.objectContaining({
			teamId: "team_5",
			kind: "video",
			internalId: "vid_5",
			provider: "openai",
			model: "sora-2",
		}));
	});
});
