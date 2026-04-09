import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VideoJobRecord } from "@core/video-jobs";

const getBindingsMock = vi.fn();
const loadByokKeyMock = vi.fn();
const openAICompatHeadersMock = vi.fn();
const openAICompatUrlMock = vi.fn();
const resolveOpenAICompatConfigMock = vi.fn();
const isOpenAICompatProviderMock = vi.fn();

vi.mock("@/runtime/env", () => ({
	getBindings: () => getBindingsMock(),
}));

vi.mock("@providers/byok", () => ({
	loadByokKey: (...args: unknown[]) => loadByokKeyMock(...args),
}));

vi.mock("@providers/openai-compatible/config", () => ({
	openAICompatHeaders: (...args: unknown[]) => openAICompatHeadersMock(...args),
	openAICompatUrl: (...args: unknown[]) => openAICompatUrlMock(...args),
	resolveOpenAICompatConfig: (...args: unknown[]) => resolveOpenAICompatConfigMock(...args),
	isOpenAICompatProvider: (...args: unknown[]) => isOpenAICompatProviderMock(...args),
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
		resolveOpenAICompatConfigMock.mockReset();
		isOpenAICompatProviderMock.mockReset();
		vi.restoreAllMocks();

		getBindingsMock.mockReturnValue({
			OPENAI_API_KEY: "gateway-openai-key",
			X_AI_API_KEY: "gateway-xai-key",
			MINIMAX_API_KEY: "gateway-minimax-key",
			MINIMAX_BASE_URL: "https://api.minimax.io",
			ALIBABA_CLOUD_API_KEY: "test-alibaba-cloud-key",
			ALIBABA_BASE_URL: "https://dashscope-intl.aliyuncs.com",
			NOVITA_API_KEY: "gateway-novita-key",
			ATLAS_CLOUD_API_KEY: "gateway-atlas-key",
			GOOGLE_VERTEX_ACCESS_TOKEN: "gateway-vertex-token",
			GOOGLE_VERTEX_BASE_URL: "https://api.vertex.example",
			GOOGLE_VERTEX_PROJECT: "test-project",
			GOOGLE_VERTEX_LOCATION: "us-east5",
		});
		openAICompatHeadersMock.mockImplementation((_providerId: string, key: string) => ({
			Authorization: `Bearer ${key}`,
		}));
		openAICompatUrlMock.mockImplementation((providerId: string, path: string) => `https://${providerId}.example${path}`);
		resolveOpenAICompatConfigMock.mockImplementation((providerId: string) => ({
			apiKeyEnv:
				providerId === "novita" || providerId === "novitaai"
					? "NOVITA_API_KEY"
					: providerId === "atlascloud" || providerId === "atlas-cloud"
						? "ATLAS_CLOUD_API_KEY"
						: providerId === "x-ai" || providerId === "xai"
							? "X_AI_API_KEY"
							: "OPENAI_API_KEY",
		}));
		isOpenAICompatProviderMock.mockImplementation((providerId: string) =>
			new Set(["openai", "x-ai", "xai", "novita", "novitaai", "atlascloud", "atlas-cloud"]).has(providerId),
		);
	});

	it("polls x-ai video status using BYOK key when present", async () => {
		const nativeId = "xai-job-123";
		const job = makeBaseJob({
			videoId: "req_video_xai_1",
			nativeId,
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
			videoId: "req_video_minimax_1",
			nativeId: taskId,
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

	it("polls alibaba/wan status using stored providerTaskId", async () => {
		const taskId = "dashscope-task-123";
		const job = makeBaseJob({
			videoId: "req_video_alibaba_1",
			nativeId: null,
			provider: "alibaba",
			model: "wan2.2-t2v-plus",
			meta: {
				provider: "alibaba",
				providerTaskId: taskId,
				keySource: "gateway",
				resolution: "1280x720",
				quality: "standard",
			},
		});

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					output: {
						task_status: "SUCCEEDED",
						model: "wan2.2-t2v-plus",
						duration: 5,
						size: "1280x720",
						quality: "standard",
					},
				}),
			}),
		);

		const result = await fetchVideoProviderStatus(job);

		expect(globalThis.fetch).toHaveBeenCalledWith(
			`https://dashscope-intl.aliyuncs.com/api/v1/tasks/${encodeURIComponent(taskId)}`,
			expect.objectContaining({
				method: "GET",
				headers: expect.objectContaining({
					Authorization: "Bearer test-alibaba-cloud-key",
				}),
			}),
		);
		expect(result).toEqual(
			expect.objectContaining({
				status: "completed",
				providerId: "alibaba",
				model: "wan2.2-t2v-plus",
				seconds: 5,
			}),
		);
	});

	it("polls google-vertex video status using fetchPredictOperation", async () => {
		const operationName =
			"projects/test-project/locations/us-east5/publishers/google/models/veo-3.1-generate-001/operations/vertex-op-123";
		const job = makeBaseJob({
			videoId: encodePrefixedId("gvtxop_", operationName),
			provider: "google-vertex",
			model: "veo-3.1-generate-001",
			meta: {
				provider: "google-vertex",
				keySource: "gateway",
				resolution: "1080p",
				quality: "standard",
			},
		});

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					name: operationName,
					done: true,
					response: {
						videos: [{ gcsUri: "gs://bucket/output/sample_0.mp4", mimeType: "video/mp4" }],
						videoMetadata: { durationSeconds: 5, resolution: "1080p" },
					},
				}),
			}),
		);

		const result = await fetchVideoProviderStatus(job);

		expect(globalThis.fetch).toHaveBeenCalledWith(
			"https://api.vertex.example/v1/projects/test-project/locations/us-east5/publishers/google/models/veo-3.1-generate-001:fetchPredictOperation",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					Authorization: "Bearer gateway-vertex-token",
					"Content-Type": "application/json",
				}),
				body: JSON.stringify({ operationName }),
			}),
		);
		expect(result).toEqual(
			expect.objectContaining({
				status: "completed",
				providerId: "google-vertex",
				model: "veo-3.1-generate-001",
				seconds: 5,
				metaPatch: expect.objectContaining({
					googleOperationName: operationName,
					googleVideoUri: "gs://bucket/output/sample_0.mp4",
					googleVideoMimeType: "video/mp4",
				}),
			}),
		);
	});

	it("polls generic openai-compatible video providers using provider-specific auth and URL", async () => {
		const nativeId = "novita-job-789";
		const job = makeBaseJob({
			videoId: "vid_compat_1",
			nativeId,
			provider: "novita",
			model: "novita/seedance-1",
			meta: {
				provider: "novita",
				keySource: "gateway",
				resolution: "720p",
				quality: "standard",
			},
		});

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({
					status: "completed",
					model: "novita/seedance-1",
					seconds: 6,
					size: "720p",
				}),
			}),
		);

		const result = await fetchVideoProviderStatus(job);

		expect(globalThis.fetch).toHaveBeenCalledWith(
			`https://novita.example/videos/${encodeURIComponent(nativeId)}`,
			expect.objectContaining({
				method: "GET",
				headers: expect.objectContaining({
					Authorization: "Bearer gateway-novita-key",
				}),
			}),
		);
		expect(result).toEqual(
			expect.objectContaining({
				status: "completed",
				providerId: "novita",
				model: "novita/seedance-1",
				seconds: 6,
			}),
		);
	});

	it("polls atlascloud prediction endpoint with result fallback support", async () => {
		const predictionId = "atlas-pred-321";
		const job = makeBaseJob({
			videoId: predictionId,
			nativeId: null,
			provider: "atlascloud",
			model: "bytedance/seedance-2.0-pro",
			meta: {
				provider: "atlascloud",
				providerTaskId: predictionId,
				keySource: "gateway",
				resolution: "720p",
				quality: "standard",
			},
		});

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					data: {
						id: predictionId,
						status: "completed",
						model: "bytedance/seedance-2.0-pro",
						outputs: ["https://cdn.atlascloud.ai/video/out.mp4"],
						duration: 8,
						size: "720p",
					},
				}),
			}),
		);

		const result = await fetchVideoProviderStatus(job);

		expect(globalThis.fetch).toHaveBeenCalledWith(
			`https://api.atlascloud.ai/api/v1/model/prediction/${encodeURIComponent(predictionId)}`,
			expect.objectContaining({
				method: "GET",
				headers: expect.objectContaining({
					Authorization: "Bearer gateway-atlas-key",
				}),
			}),
		);
		expect(result).toEqual(
			expect.objectContaining({
				status: "completed",
				providerId: "atlascloud",
				model: "bytedance/seedance-2.0-pro",
				seconds: 8,
				metaPatch: expect.objectContaining({
					providerTaskId: predictionId,
					atlasOutputUrl: "https://cdn.atlascloud.ai/video/out.mp4",
				}),
			}),
		);
	});
});
