import { beforeEach, describe, expect, it, vi } from "vitest";

const getAsyncOperationMock = vi.fn();
const upsertAsyncOperationMock = vi.fn();

vi.mock("@core/async-operations", () => ({
	getAsyncOperation: (...args: unknown[]) => getAsyncOperationMock(...args),
	upsertAsyncOperation: (...args: unknown[]) => upsertAsyncOperationMock(...args),
}));

import { getMusicJobMeta, saveMusicJobMeta } from "./music-jobs";

describe("music-jobs", () => {
	beforeEach(() => {
		getAsyncOperationMock.mockReset();
		upsertAsyncOperationMock.mockReset();
	});

	it("reads metadata from DB", async () => {
		getAsyncOperationMock.mockResolvedValue({
			teamId: "team_1",
			kind: "music",
			internalId: "mus_1",
			provider: "suno",
			nativeId: "native_1",
			model: "v4_5plus",
			status: "in_progress",
			meta: { duration: 8, format: "mp3" },
			billedAt: null,
			createdAt: null,
			updatedAt: null,
		});

		const meta = await getMusicJobMeta("team_1", "mus_1");
		expect(meta).toEqual({
			provider: "suno",
			model: "v4_5plus",
			duration: 8,
			format: "mp3",
			status: "in_progress",
			nativeResponseId: "native_1",
		});
	});

	it("returns null when DB record is missing", async () => {
		getAsyncOperationMock.mockResolvedValue(null);
		const meta = await getMusicJobMeta("team_2", "mus_2");
		expect(meta).toBeNull();
	});

	it("saves metadata to DB with kind=music", async () => {
		upsertAsyncOperationMock.mockResolvedValue(undefined);

		await saveMusicJobMeta("team_3", "mus_3", {
			provider: "elevenlabs",
			model: "music_v2",
			status: "queued",
		});

		expect(upsertAsyncOperationMock).toHaveBeenCalledWith(expect.objectContaining({
			teamId: "team_3",
			kind: "music",
			internalId: "mus_3",
			provider: "elevenlabs",
			model: "music_v2",
			status: "queued",
		}));
	});
});

