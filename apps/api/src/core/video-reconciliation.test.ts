import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoJobRecord } from "@core/video-jobs";

const getBindingsMock = vi.fn();
const loadByokKeyMock = vi.fn();
const openAICompatHeadersMock = vi.fn();
const openAICompatUrlMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	getBindings: () => getBindingsMock(),
}));

vi.mock("@providers/byok", () => ({
	loadByokKey: (...args: unknown[]) => loadByokKeyMock(...args),
}));

vi.mock("@providers/openai-compatible/config", () => ({
	openAICompatHeaders: (...args: unknown[]) => openAICompatHeadersMock(...args),
	openAICompatUrl: (...args: unknown[]) => openAICompatUrlMock(...args),
}));

import { fetchVideoProviderStatus } from "./video-reconciliation";

function encodePrefixedId(prefix: string, value: string): string {
	const b64 = Buffer.from(value, "utf8")
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
	return `${prefix}${b64}`;
}

function makeBaseJob(overrides: Partial<VideoJobRecord>): VideoJobRecord {
	return {
		teamId: "team_1",
		videoId: "vid_1",
		nativeId: null,
		provider: null,
		model: null,
		status: "in_progress",
		billedAt: null,
		meta: null,
		updatedAt: null,
		createdAt: null,
		...overrides,
	};
}

describe("video-reconciliation provider polling", () => {
	beforeEach(() => {
		getBindingsMock.mockReset();
		loadByokKeyMock.mockReset();
		openAICompatHeadersMock.mockReset();
		openAICompatUrlMock.mockReset();
		vi.restoreAllMocks();

		getBindingsMock.mockReturnValue({
			X_AI_API_KEY: "gateway-xai-key",
			MINIMAX_API_KEY: "gateway-minimax-key",
			MINIMAX_BASE_URL: "https://api.minimax.io",
		});
		openAICompatHeadersMock.mockImplementation((_providerId: string, key: string) => ({
			Authorization: `Bearer ${key}`,
		}));
		openAICompatUrlMock.mockImplementation((_providerId: string, path: string) => `https://x-ai.example${path}`);
	});

	it("polls x-ai video status using BYOK key when present", async () => {
		const nativeId = "xai-job-123";
		const job = makeBaseJob({
			videoId: encodePrefixedId("xaivid_", nativeId),
			provider: "x-ai",
			model: "x-ai/grok-imagine-video-2026-01-29",
			meta: {
				provider: "x-ai",
				keySource: "byok",
				byokKeyId: "byok_xai_1",
				resolution: "720p",
				quality: "standard",
			},
		});

		loadByokKeyMock.mockResolvedValue({ key: "byok-xai-key" });
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					status: "completed",
					model: "x-ai/grok-imagine-video-2026-01-29",
					seconds: 12,
					resolution: "720p",
					quality: "standard",
				}),
			}),
		);

		const result = await fetchVideoProviderStatus(job);

		expect(loadByokKeyMock).toHaveBeenCalledWith(
			expect.objectContaining({
				teamId: "team_1",
				providerId: "x-ai",
			}),
		);
		expect(globalThis.fetch).toHaveBeenCalledWith(
			`https://x-ai.example/videos/${encodeURIComponent(nativeId)}`,
			expect.objectContaining({
				method: "GET",
				headers: expect.objectContaining({
					Authorization: "Bearer byok-xai-key",
				}),
			}),
		);
		expect(result).toEqual(
			expect.objectContaining({
				status: "completed",
				providerId: "x-ai",
				model: "x-ai/grok-imagine-video-2026-01-29",
				seconds: 12,
			}),
		);
	});

	it("polls minimax video status using gateway key when BYOK is absent", async () => {
		const taskId = "minimax-task-456";
		const job = makeBaseJob({
			videoId: encodePrefixedId("mmxvid_", taskId),
			provider: "minimax",
			model: "minimax/video-02",
			meta: {
				provider: "minimax",
				keySource: "gateway",
				resolution: "1024x576",
				quality: "high",
			},
		});

		loadByokKeyMock.mockResolvedValue(null);
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					status: "success",
					model: "minimax/video-02",
					duration: 8,
					resolution: "1024x576",
					quality: "high",
				}),
			}),
		);

		const result = await fetchVideoProviderStatus(job);

		expect(loadByokKeyMock).not.toHaveBeenCalled();
		expect(globalThis.fetch).toHaveBeenCalledWith(
			`https://api.minimax.io/v1/query/video_generation?task_id=${encodeURIComponent(taskId)}`,
			expect.objectContaining({
				method: "GET",
				headers: expect.objectContaining({
					Authorization: "Bearer gateway-minimax-key",
				}),
			}),
		);
		expect(result).toEqual(
			expect.objectContaining({
				status: "completed",
				providerId: "minimax",
				model: "minimax/video-02",
				seconds: 8,
			}),
		);
	});
});
