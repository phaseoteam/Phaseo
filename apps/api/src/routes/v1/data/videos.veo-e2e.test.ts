import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IRVideoGenerationRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";

type StoredJob = {
	record: any;
	meta: any;
};

const state = vi.hoisted(() => ({
	jobs: new Map<string, StoredJob>(),
	gatewayRequests: new Map<string, any>(),
	reservedAmounts: new Map<string, number>(),
	releasedReservations: new Set<string>(),
	capturedReservations: new Set<string>(),
	reserveCalls: [] as Array<Record<string, unknown>>,
	releaseCalls: [] as Array<Record<string, unknown>>,
	captureCalls: [] as Array<Record<string, unknown>>,
	webhookEvents: [] as Array<Record<string, unknown>>,
	lastPersistedContent: null as
		| {
				workspaceId: string;
				videoId: string;
				index: number;
				sourceUrl: string | null;
				contentDisposition: string | null;
				filename: string | null;
				bytes: Uint8Array;
		  }
		| null,
}));

function resetState() {
	state.jobs.clear();
	state.gatewayRequests.clear();
	state.reservedAmounts.clear();
	state.releasedReservations.clear();
	state.capturedReservations.clear();
	state.reserveCalls = [];
	state.releaseCalls = [];
	state.captureCalls = [];
	state.webhookEvents = [];
	state.lastPersistedContent = null;
}

function jobKey(workspaceId: string, videoId: string) {
	return `${workspaceId}:${videoId}`;
}

function getStoredJob(workspaceId: string, videoId: string): StoredJob | null {
	return state.jobs.get(jobKey(workspaceId, videoId)) ?? null;
}

function setStoredJob(workspaceId: string, videoId: string, job: StoredJob) {
	state.jobs.set(jobKey(workspaceId, videoId), job);
}

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function videoPricingRows() {
	const now = "2026-06-10T00:00:00.000Z";
	return [
		{
			rule_id: "test-veo-lite-720p",
			model_key: "google-vertex:google/veo-3.1-lite-generate-preview:video.generate",
			capability_id: "video.generate",
			pricing_plan: "standard",
			meter: "output_video_seconds",
			unit: "second",
			unit_size: 1,
			price_per_unit: "0.03",
			currency: "USD",
			note: null,
			match: [
				{ path: "video_params.resolution", op: "eq", value: "720p" },
			],
			priority: 100,
			effective_from: null,
			effective_to: null,
			updated_at: now,
		},
	];
}

function buildSupabaseAdminMock() {
	return {
		from(table: string) {
			if (table === "data_api_pricing_rules") {
				return {
					select() {
						let orderCalls = 0;
						const builder = {
							eq() {
								return builder;
							},
							or() {
								return builder;
							},
							order() {
								orderCalls += 1;
								return orderCalls >= 2
									? Promise.resolve({ data: videoPricingRows(), error: null })
									: builder;
							},
						};
						return builder;
					},
				};
			}
			if (table !== "gateway_requests") {
				throw new Error(`Unexpected table: ${table}`);
			}
			return {
				select() {
					const filters: Record<string, unknown> = {};
					return {
						eq(field: string, value: unknown) {
							filters[field] = value;
							return this;
						},
						order() {
							return this;
						},
						limit: async () => {
							const requestId = String(filters.request_id ?? "");
							const workspaceId = String(filters.workspace_id ?? "");
							const row = state.gatewayRequests.get(requestId);
							if (!row || row.workspace_id !== workspaceId) {
								return { data: [], error: null };
							}
							return { data: [row], error: null };
						},
					};
				},
				update(patch: Record<string, unknown>) {
					const filters: Record<string, unknown> = {};
					return {
						eq(field: string, value: unknown) {
							filters[field] = value;
							return this;
						},
						select: async () => {
							const id = String(filters.id ?? "");
							const workspaceId = String(filters.workspace_id ?? "");
							const row = Array.from(state.gatewayRequests.values()).find(
								(candidate) => candidate.id === id && candidate.workspace_id === workspaceId,
							);
							if (!row) {
								return { data: [], error: null };
							}
							Object.assign(row, patch);
							return { data: [{ id: row.id }], error: null };
						},
					};
				},
			};
		},
	};
}

vi.mock("@/runtime/env", () => ({
	getBindings: () => ({
		GOOGLE_VERTEX_ACCESS_TOKEN: "test-vertex-token",
		GOOGLE_VERTEX_BASE_URL: "https://api.vertex.example",
		GOOGLE_VERTEX_PROJECT: "test-project",
		GOOGLE_VERTEX_LOCATION: "us-east5",
		GATEWAY_PUBLIC_BASE_URL: "https://api.phaseo.app",
		KEY_PEPPER: "test-video-secret",
	}),
	getSupabaseAdmin: () => buildSupabaseAdminMock(),
}));

vi.mock("@pipeline/before/guards", () => ({
	guardAuth: vi.fn(async () => ({
		ok: true,
		value: {
			requestId: "req_auth_video_e2e",
			workspaceId: "ws_video_e2e",
			apiKeyId: "key_video_e2e",
			apiKeyRef: null,
			apiKeyKid: null,
			internal: false,
		},
	})),
}));

vi.mock("@core/video-jobs", () => ({
	saveVideoJobMeta: vi.fn(async (workspaceId: string, videoId: string, meta: any, nativeId?: string | null, status = "queued") => {
		const now = new Date().toISOString();
		const record = {
			workspaceId,
			videoId,
			requestId: meta.requestId ?? videoId,
			sessionId: meta.sessionId ?? null,
			appId: meta.appId ?? null,
			nativeId: nativeId ?? meta.providerTaskId ?? null,
			provider: meta.provider ?? null,
			model: meta.model ?? null,
			status,
			billedAt: null,
			meta: { ...meta },
			updatedAt: now,
			createdAt: now,
		};
		setStoredJob(workspaceId, videoId, { record, meta: record.meta });
		if (record.requestId) {
			state.gatewayRequests.set(record.requestId, {
				id: `gw_${videoId}`,
				workspace_id: workspaceId,
				request_id: record.requestId,
				created_at: now,
				usage: {},
				pricing_lines: [],
			});
		}
	}),
	getVideoJobMeta: vi.fn(async (workspaceId: string, videoId: string) => getStoredJob(workspaceId, videoId)?.meta ?? null),
	getVideoJobRecord: vi.fn(async (workspaceId: string, videoId: string) => getStoredJob(workspaceId, videoId)?.record ?? null),
	setVideoJobStatus: vi.fn(async (workspaceId: string, videoId: string, status: string, metaPatch?: Record<string, unknown>) => {
		const current = getStoredJob(workspaceId, videoId);
		if (!current) throw new Error(`Missing video job ${workspaceId}/${videoId}`);
		const nextMeta = { ...(current.meta ?? {}), ...(metaPatch ?? {}) };
		const nextRecord = {
			...current.record,
			status,
			meta: nextMeta,
			updatedAt: new Date().toISOString(),
		};
		setStoredJob(workspaceId, videoId, { record: nextRecord, meta: nextMeta });
	}),
	isVideoJobBilled: vi.fn(async (workspaceId: string, videoId: string) => Boolean(getStoredJob(workspaceId, videoId)?.record?.billedAt)),
	markVideoJobBilled: vi.fn(async (workspaceId: string, videoId: string) => {
		const current = getStoredJob(workspaceId, videoId);
		if (!current) throw new Error(`Missing video job ${workspaceId}/${videoId}`);
		current.record.billedAt = new Date().toISOString();
		setStoredJob(workspaceId, videoId, current);
	}),
	listTeamVideoJobs: vi.fn(async () => []),
}));

vi.mock("@core/wallet-reservations", () => ({
	reserveWalletCredits: vi.fn(async (args: { reservationId: string; amountNanos: number }) => {
		state.reserveCalls.push(args as unknown as Record<string, unknown>);
		state.reservedAmounts.set(args.reservationId, args.amountNanos);
		return {
			applied: true,
			alreadyApplied: false,
			status: "held",
			amountNanos: args.amountNanos,
		};
	}),
	captureWalletReservation: vi.fn(async (args: { reservationId: string }) => {
		state.captureCalls.push(args as unknown as Record<string, unknown>);
		const amountNanos = state.reservedAmounts.get(args.reservationId) ?? 0;
		if (state.capturedReservations.has(args.reservationId)) {
			return {
				applied: false,
				alreadyApplied: true,
				status: "captured",
				amountNanos,
			};
		}
		state.capturedReservations.add(args.reservationId);
		state.releasedReservations.delete(args.reservationId);
		return {
			applied: true,
			alreadyApplied: false,
			status: "captured",
			amountNanos,
		};
	}),
	releaseWalletReservation: vi.fn(async (args: { reservationId: string }) => {
		state.releaseCalls.push(args as unknown as Record<string, unknown>);
		const amountNanos = state.reservedAmounts.get(args.reservationId) ?? 0;
		if (state.releasedReservations.has(args.reservationId)) {
			return {
				applied: false,
				alreadyApplied: true,
				status: "released",
				amountNanos,
			};
		}
		state.releasedReservations.add(args.reservationId);
		return {
			applied: true,
			alreadyApplied: false,
			status: "released",
			amountNanos,
		};
	}),
}));

vi.mock("@core/video-user-webhooks", () => ({
	dispatchVideoWebhookEventInBackground: vi.fn((payload: Record<string, unknown>) => {
		state.webhookEvents.push(payload);
	}),
}));

vi.mock("@core/workspace-usage-rollups", () => ({
	syncWorkspaceUsageRollupForRequest: vi.fn(async () => undefined),
}));

vi.mock("./videos.helpers", async () => {
	const actual = await vi.importActual<typeof import("./videos.helpers")>("./videos.helpers");
	return {
		...actual,
		persistFetchedVideoResponse: vi.fn(async (args: {
			workspaceId: string;
			videoId: string;
			index: number;
			response: Response;
			sourceUrl?: string | null;
			contentDisposition?: string | null;
			filename?: string | null;
		}) => {
			const bytes = new Uint8Array(await args.response.arrayBuffer());
			state.lastPersistedContent = {
				workspaceId: args.workspaceId,
				videoId: args.videoId,
				index: args.index,
				sourceUrl: args.sourceUrl ?? null,
				contentDisposition: args.contentDisposition ?? null,
				filename: args.filename ?? null,
				bytes,
			};
			return new Response(bytes, {
				status: args.response.status,
				headers: {
					"Content-Type": args.response.headers.get("content-type") ?? "video/mp4",
				},
			});
		}),
		persistBufferedVideoResponse: vi.fn(async (args: {
			workspaceId: string;
			videoId: string;
			index: number;
			buffer: Uint8Array;
			mimeType?: string | null;
			contentDisposition?: string | null;
			filename?: string | null;
		}) => {
			const bytes = args.buffer instanceof Uint8Array ? args.buffer : new Uint8Array(args.buffer);
			state.lastPersistedContent = {
				workspaceId: args.workspaceId,
				videoId: args.videoId,
				index: args.index,
				sourceUrl: null,
				contentDisposition: args.contentDisposition ?? null,
				filename: args.filename ?? null,
				bytes,
			};
			return new Response(bytes, {
				status: 200,
				headers: {
					"Content-Type": args.mimeType ?? "video/mp4",
				},
			});
		}),
	};
});

import { execute } from "../../../executors/google-vertex/video-generate";
import { getVideoByIdHandler } from "./videos.get-by-id";
import { getVideoContentHandler } from "./videos.get-content";

function loadVeoLitePricingCard() {
	const filePath = path.resolve(
		process.cwd(),
		"../..",
		"packages/data/catalog/src/data/pricing/google-vertex/google-veo-3.1-lite-generate-preview/video.generate/pricing.json",
	);
	return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildExecutorArgs(
	requestId: string,
	overrides: Partial<IRVideoGenerationRequest> = {},
): ExecutorExecuteArgs {
	const ir: IRVideoGenerationRequest = {
		model: "google/veo-3.1-lite-generate-preview",
		prompt: "A slow cinematic pan across a coastal cliff at sunrise.",
		durationSeconds: 5,
		size: "720p",
		generateAudio: false,
		...overrides,
	};

	return {
		ir,
		requestId,
		workspaceId: "ws_video_e2e",
		providerId: "google-vertex",
		endpoint: "video.generation",
		protocol: "google.vertex.video",
		capability: "video.generate",
		providerModelSlug: null,
		capabilityParams: null,
		byokMeta: [],
		pricingCard: loadVeoLitePricingCard(),
		meta: {},
	} as ExecutorExecuteArgs;
}

describe("video Veo 3.1 Lite lifecycle end-to-end", () => {
	beforeEach(() => {
		resetState();
		vi.restoreAllMocks();
	});

	it("plans and executes the submit -> hold -> complete -> content retrieval -> capture flow at the 720p no-audio rate", async () => {
		const requestId = "vid_veo_lite_success";
		const operationName =
			"projects/test-project/locations/us-east5/publishers/google/models/veo-3.1-lite-generate-preview/operations/vertex-op-success";
		const videoUrl = "https://cdn.vertex.example/videos/veo-lite-success.mp4";
		const videoBytes = Uint8Array.from([0, 1, 2, 3, 4, 5]);

		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				if (url.includes(":predictLongRunning")) {
					return jsonResponse({
						name: operationName,
						done: false,
					});
				}
				if (url.includes(":fetchPredictOperation")) {
					const body = JSON.parse(String(init?.body ?? "{}"));
					expect(body.operationName).toBe(operationName);
					return jsonResponse({
						name: operationName,
						done: true,
						response: {
							model: "google/veo-3.1-lite-generate-preview",
							videos: [{ uri: videoUrl, mimeType: "video/mp4" }],
							videoMetadata: {
								durationSeconds: 5,
								resolution: "720p",
							},
						},
						metadata: {
							quality: "standard",
						},
					});
				}
				if (url === videoUrl) {
					return new Response(videoBytes, {
						status: 200,
						headers: { "Content-Type": "video/mp4" },
					});
				}
				throw new Error(`Unexpected fetch url: ${url}`);
			}),
		);

		const submitResult = await execute(buildExecutorArgs(requestId));
		expect(submitResult.ir?.status).toBe("queued");
		expect(submitResult.ir?.nativeId).toBeTruthy();
		expect(state.reserveCalls).toHaveLength(1);
		expect(state.reserveCalls[0]).toMatchObject({
			reservationId: `video_hold:${requestId}`,
			amountNanos: 150_000_000,
			holdRefId: requestId,
		});

		const storedAfterSubmit = getStoredJob("ws_video_e2e", requestId);
		expect(storedAfterSubmit?.meta).toMatchObject({
			model: "google/veo-3.1-lite-generate-preview",
			seconds: 5,
			resolution: "720p",
			audio: false,
			reservationId: `video_hold:${requestId}`,
			reservedNanos: 150_000_000,
			reservationStatus: "held",
		});

		const statusResponse = await getVideoByIdHandler(
			new Request(`https://api.phaseo.app/v1/videos/${requestId}`),
		);
		expect(statusResponse.status).toBe(200);
		const statusBody = await statusResponse.json();
		expect(statusBody.status).toBe("completed");
		expect(statusBody.billing).toMatchObject({
			state: "settled",
			billable: true,
			estimated_user_cost: "0.15",
			settled_user_cost: "0.15",
		});

		expect(state.captureCalls).toHaveLength(1);
		expect(state.releaseCalls).toHaveLength(0);
		const storedAfterCompletion = getStoredJob("ws_video_e2e", requestId);
		expect(storedAfterCompletion?.record?.billedAt).toBeTruthy();
		expect(storedAfterCompletion?.meta).toMatchObject({
			charged: true,
			costNanos: 150_000_000,
			costUsd: 0.15,
			billingReason: "captured",
			googleVideoUri: videoUrl,
		});

		const gatewayRequest = state.gatewayRequests.get(requestId);
		expect(gatewayRequest?.usage).toMatchObject({
			output_video_seconds: 5,
			resolution: "720p",
			video_resolution: "720p",
			video_quality: "standard",
			cost_usd: 0.15,
		});
		expect(gatewayRequest?.cost_nanos).toBe(150_000_000);

		const contentResponse = await getVideoContentHandler(
			new Request(`https://api.phaseo.app/v1/videos/${requestId}/content`),
		);
		expect(contentResponse.status).toBe(200);
		expect(contentResponse.headers.get("content-type")).toBe("video/mp4");
		expect(new Uint8Array(await contentResponse.arrayBuffer())).toEqual(videoBytes);
		expect(state.lastPersistedContent).toBeNull();
		expect(state.captureCalls).toHaveLength(1);
	});

	it("plans and executes the submit -> hold -> failed terminal status -> release flow without charging", async () => {
		const requestId = "vid_veo_lite_failure";
		const operationName =
			"projects/test-project/locations/us-east5/publishers/google/models/veo-3.1-lite-generate-preview/operations/vertex-op-failure";

		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				if (url.includes(":predictLongRunning")) {
					return jsonResponse({
						name: operationName,
						done: false,
					});
				}
				if (url.includes(":fetchPredictOperation")) {
					const body = JSON.parse(String(init?.body ?? "{}"));
					expect(body.operationName).toBe(operationName);
					return jsonResponse({
						name: operationName,
						done: true,
						error: {
							code: 500,
							message: "upstream video generation failed",
						},
						response: {
							videoMetadata: {
								durationSeconds: 5,
								resolution: "720p",
							},
						},
					});
				}
				throw new Error(`Unexpected fetch url: ${url}`);
			}),
		);

		const submitResult = await execute(buildExecutorArgs(requestId));
		expect(submitResult.ir?.status).toBe("queued");
		expect(state.reserveCalls).toHaveLength(1);
		expect(state.reserveCalls[0]).toMatchObject({
			reservationId: `video_hold:${requestId}`,
			amountNanos: 150_000_000,
		});

		const statusResponse = await getVideoByIdHandler(
			new Request(`https://api.phaseo.app/v1/videos/${requestId}`),
		);
		expect(statusResponse.status).toBe(200);
		const statusBody = await statusResponse.json();
		expect(statusBody.status).toBe("failed");
		expect(statusBody.billing).toMatchObject({
			state: "void",
			billable: false,
			settled_user_cost: "0.00",
		});

		expect(state.captureCalls).toHaveLength(0);
		expect(state.releaseCalls).toHaveLength(1);
		const storedAfterFailure = getStoredJob("ws_video_e2e", requestId);
		expect(storedAfterFailure?.record?.billedAt).toBeTruthy();
		expect(storedAfterFailure?.meta).toMatchObject({
			charged: false,
			costNanos: 0,
			costUsd: 0,
			billingReason: "released",
		});

		const gatewayRequest = state.gatewayRequests.get(requestId);
		expect(gatewayRequest?.usage).toMatchObject({
			output_video_seconds: 5,
			resolution: "720p",
			video_resolution: "720p",
			cost_usd: 0,
		});
		expect(gatewayRequest?.cost_nanos).toBe(0);
	});

	it("normalizes Google Vertex status fetch failures through the public error contract", async () => {
		const requestId = "vid_veo_lite_vertex_forbidden";
		const operationName =
			"projects/test-project/locations/us-east5/publishers/google/models/veo-3.1-lite-generate-preview/operations/vertex-op-forbidden";

		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				if (url.includes(":predictLongRunning")) {
					return jsonResponse({
						name: operationName,
						done: false,
					});
				}
				if (url.includes(":fetchPredictOperation")) {
					const body = JSON.parse(String(init?.body ?? "{}"));
					expect(body.operationName).toBe(operationName);
					return jsonResponse({
						error: {
							code: "PERMISSION_DENIED",
							message: "The caller does not have permission.",
						},
					}, 403);
				}
				throw new Error(`Unexpected fetch url: ${url}`);
			}),
		);

		const submitResult = await execute(buildExecutorArgs(requestId));
		expect(submitResult.ir?.status).toBe("queued");

		const statusResponse = await getVideoByIdHandler(
			new Request(`https://api.phaseo.app/v1/videos/${requestId}`),
		);
		expect(statusResponse.status).toBe(502);
		const statusBody = await statusResponse.json();
		expect(statusBody).toMatchObject({
			error: "upstream_error",
			reason: "google_vertex_operation_fetch_failed",
			request_id: "req_auth_video_e2e",
			workspace_id: "ws_video_e2e",
			generation_id: "req_auth_video_e2e",
			status_code: 502,
			error_type: "system",
			error_origin: "upstream",
			provider: "google-vertex",
			upstream_status: 403,
			upstream_error: {
				code: "PERMISSION_DENIED",
				message: "The caller does not have permission.",
				description: "The caller does not have permission.",
			},
			provider_failure_diagnostics: {
				category: "provider_access_missing",
				provider: "google-vertex",
			},
			operation_name: operationName,
		});
	});
});
