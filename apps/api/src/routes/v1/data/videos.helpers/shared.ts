import type { VideoJobMeta, VideoJobRecord } from "@core/video-jobs";

export const OPENAI_PROVIDER_ID = "openai";
export const XAI_PROVIDER_ID = "x-ai";
export const MINIMAX_PROVIDER_ID = "minimax";
export const BYTEDANCE_PROVIDER_ID = "bytedance-seed";
export const RUNWAY_PROVIDER_ID = "runway";
export const ATLAS_PROVIDER_ID = "atlascloud";
export const GOOGLE_BASE_URL = "https://generativelanguage.googleapis.com";
export const DEFAULT_BYTEDANCE_BASE_URL = "https://ark.ap-southeast.bytepluses.com";
export const DEFAULT_RUNWAY_BASE_URL = "https://api.dev.runwayml.com";
export const DEFAULT_ATLASCLOUD_BASE_URL = "https://api.atlascloud.ai";
export const GOOGLE_OPERATION_PREFIX = "gaiop_";
export const DASHSCOPE_TASK_PREFIX = "dscope_";
export const XAI_VIDEO_PREFIX = "xaivid_";
export const MINIMAX_VIDEO_PREFIX = "mmxvid_";
export const BYTEDANCE_VIDEO_PREFIX = "bdvid_";
export const RUNWAY_VIDEO_PREFIX = "rwyvid_";
export const ATLAS_VIDEO_PREFIX = "atlsvid_";
export const DEFAULT_OPENAI_VIDEO_PROXY_TIMEOUT_MS = 30000;
export const DEFAULT_VIDEO_POLL_SECONDS = 20;
export const DEFAULT_VIDEO_DOWNLOAD_TTL_SECONDS = 900;
export const MAX_VIDEO_DOWNLOAD_TTL_SECONDS = 3600;

export type VideoRouteAuth = {
	requestId: string;
	teamId: string;
	apiKeyId: string;
	apiKeyRef: string | null;
	apiKeyKid: string | null;
	internal?: boolean;
};

export type VideoStatus = "pending" | "in_progress" | "completed" | "failed" | "cancelled";

export function normalizeText(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

export type { VideoJobMeta, VideoJobRecord };
