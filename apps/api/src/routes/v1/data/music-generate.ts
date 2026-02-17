// src/routes/v1/generation/music-generate.ts
// Purpose: Data-plane route handler for music-generate requests.
// Why: Keeps endpoint wiring separate from pipeline logic.
// How: Wires HTTP routes to pipeline entrypoints and response helpers.

import { Hono } from "hono";
import type { Env } from "@/runtime/types";
import { makeEndpointHandler } from "@pipeline/index";
import { MusicGenerateSchema } from "@core/schemas";
import { guardAuth } from "@pipeline/before/guards";
import { err } from "@pipeline/before/http";
import { getBindings } from "@/runtime/env";
import { getMusicJobMeta, type MusicJobMeta } from "@core/music-jobs";
import { withRuntime } from "../../utils";

const musicGenerateHandler = makeEndpointHandler({ endpoint: "music.generate", schema: MusicGenerateSchema });
const SUNO_PROVIDER_ID = "suno";
const ELEVENLABS_PROVIDER_ID = "elevenlabs";
const MINIMAX_PROVIDER_ID = "minimax";
const MINIMAX_MUSIC_PREFIX = "mmxmus_";

export const musicGenerateRoutes = new Hono<Env>();

musicGenerateRoutes.post("/", withRuntime(musicGenerateHandler));

function mapSunoTaskStatus(value: unknown): "queued" | "in_progress" | "completed" | "failed" {
	const status = String(value ?? "").trim().toUpperCase();
	if (status === "SUCCESS" || status === "SUCCEEDED" || status === "COMPLETED") return "completed";
	if (status === "PENDING" || status === "TEXT_SUCCESS" || status === "FIRST_SUCCESS" || status === "RUNNING") {
		return "in_progress";
	}
	if (
		status === "CREATE_TASK_FAILED" ||
		status === "CALLBACK_EXCEPTION" ||
		status === "GENERATE_AUDIO_FAILED" ||
		status === "SENSITIVE_WORD_ERROR" ||
		status === "FAILED" ||
		status === "ERROR"
	) {
		return "failed";
	}
	return "queued";
}

function mapMiniMaxTaskStatus(value: unknown): "queued" | "in_progress" | "completed" | "failed" {
	const status = String(value ?? "").toLowerCase();
	if (status === "success" || status === "succeeded" || status === "completed" || status === "finished") {
		return "completed";
	}
	if (status === "failed" || status === "error" || status === "cancelled" || status === "canceled") return "failed";
	if (status === "running" || status === "processing" || status === "in_progress") return "in_progress";
	return "queued";
}

function decodeMiniMaxMusicId(musicId: string): string | null {
	if (!musicId.startsWith(MINIMAX_MUSIC_PREFIX)) return null;
	const b64 = musicId.slice(MINIMAX_MUSIC_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
	const padded = b64 + "===".slice((b64.length + 3) % 4);
	try {
		return atob(padded);
	} catch {
		return null;
	}
}

function toPositiveNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value) && value > 0) {
		return value;
	}
	if (typeof value === "string" && value.trim().length > 0) {
		const parsed = Number(value.trim());
		if (Number.isFinite(parsed) && parsed > 0) return parsed;
	}
	return undefined;
}

type SunoOutputItem = {
	index: number;
	id: string | null;
	audio_url: string | null;
	stream_audio_url: string | null;
	image_url: string | null;
	title: string | null;
	tags: string | null;
	duration: number | null;
};

function parseSunoOutput(json: any): { output: SunoOutputItem[]; totalDurationSeconds: number } {
	const tracksCandidates = [
		json?.data?.response?.sunoData,
		json?.data?.sunoData,
		json?.data?.response?.data,
		json?.data?.data,
		json?.data,
	];
	const tracks = tracksCandidates.find((entry) => Array.isArray(entry)) ?? [];
	let totalDurationSeconds = 0;
	const output = tracks.map((track: any, index: number) => {
		const duration = toPositiveNumber(track?.duration ?? track?.durationSeconds ?? track?.metadata?.duration);
		if (duration) totalDurationSeconds += duration;
		return {
			index,
			id: track?.id != null ? String(track.id) : null,
			audio_url: track?.audioUrl ?? track?.audio_url ?? null,
			stream_audio_url: track?.streamAudioUrl ?? track?.stream_audio_url ?? null,
			image_url: track?.imageUrl ?? track?.image_url ?? null,
			title: track?.title ?? null,
			tags: track?.tags ?? null,
			duration: duration ?? null,
		};
	});
	return { output, totalDurationSeconds };
}

async function fetchSunoTask(taskId: string) {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const key = bindings.SUNO_API_KEY;
	if (!key) {
		return err("upstream_error", {
			reason: "suno_key_missing",
		});
	}
	const baseUrl = String(bindings.SUNO_BASE_URL || "https://api.sunoapi.org").replace(/\/+$/, "");
	return fetch(`${baseUrl}/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${key}`,
			"Content-Type": "application/json",
		},
	});
}

async function fetchMiniMaxTask(taskId: string) {
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const key = bindings.MINIMAX_API_KEY;
	if (!key) {
		return err("upstream_error", {
			reason: "minimax_key_missing",
		});
	}
	const baseUrl = String(bindings.MINIMAX_BASE_URL || "https://api.minimax.io").replace(/\/+$/, "");
	return fetch(`${baseUrl}/v1/query/music_generation?task_id=${encodeURIComponent(taskId)}`, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${key}`,
			"Content-Type": "application/json",
		},
	});
}

function parseMiniMaxOutput(json: any): { output: SunoOutputItem[]; totalDurationSeconds: number } {
	const audioUrl =
		json?.audio_url ??
		json?.audioUrl ??
		json?.url ??
		json?.data?.audio_url ??
		json?.data?.audioUrl ??
		json?.output?.audio_url ??
		json?.output?.audioUrl;
	const duration = toPositiveNumber(
		json?.duration ??
		json?.duration_seconds ??
		json?.data?.duration ??
		json?.output?.duration
	);
	return {
		output: [{
			index: 0,
			id: json?.id != null ? String(json.id) : null,
			audio_url: typeof audioUrl === "string" ? audioUrl : null,
			stream_audio_url: null,
			image_url: null,
			title: json?.title ?? null,
			tags: json?.tags ?? null,
			duration: duration ?? null,
		}],
		totalDurationSeconds: duration ?? 0,
	};
}

function parseMetaOutput(meta: MusicJobMeta | null): {
	output: SunoOutputItem[];
	totalDurationSeconds: number;
} {
	const rawOutput = Array.isArray((meta as any)?.output) ? (meta as any).output : [];
	let totalDurationSeconds = 0;
	const output = rawOutput.map((item: any, index: number) => {
		const duration = toPositiveNumber(item?.duration);
		if (duration) totalDurationSeconds += duration;
		return {
			index: typeof item?.index === "number" ? item.index : index,
			id: item?.id != null ? String(item.id) : null,
			audio_url: typeof item?.audio_url === "string" ? item.audio_url : null,
			stream_audio_url: typeof item?.stream_audio_url === "string" ? item.stream_audio_url : null,
			image_url: typeof item?.image_url === "string" ? item.image_url : null,
			title: typeof item?.title === "string" ? item.title : null,
			tags: typeof item?.tags === "string" ? item.tags : null,
			duration: duration ?? null,
		};
	});
	return { output, totalDurationSeconds };
}

musicGenerateRoutes.get("/:musicId", withRuntime(async (req) => {
	const auth = await guardAuth(req);
	if (!auth.ok) return (auth as { ok: false; response: Response }).response;
	const id = decodeURIComponent(new URL(req.url).pathname.split("/").pop() ?? "");
	if (!id) {
		return err("validation_error", {
			reason: "missing_music_id",
			request_id: auth.value.requestId,
			team_id: auth.value.teamId,
		});
	}

	const meta = await getMusicJobMeta(auth.value.teamId, id);
	const provider = meta?.provider ?? SUNO_PROVIDER_ID;
	const minimaxTaskId = decodeMiniMaxMusicId(id);
	if (
		provider !== SUNO_PROVIDER_ID &&
		provider !== ELEVENLABS_PROVIDER_ID &&
		provider !== MINIMAX_PROVIDER_ID &&
		!minimaxTaskId
	) {
		return err("not_supported", {
			reason: "music_status_not_supported_for_provider",
			request_id: auth.value.requestId,
			team_id: auth.value.teamId,
		});
	}

	if (provider === ELEVENLABS_PROVIDER_ID) {
		const { output, totalDurationSeconds } = parseMetaOutput(meta);
		const status =
			typeof meta?.status === "string" && meta.status.length > 0
				? (meta.status as "queued" | "in_progress" | "completed" | "failed")
				: "completed";
		const usage =
			status === "completed"
				? {
					output_audio_count: output.filter((item) => item.audio_url).length,
					...(totalDurationSeconds > 0 ? { output_audio_seconds: totalDurationSeconds } : {}),
				}
				: undefined;

		return new Response(JSON.stringify({
			id,
			object: "music",
			status,
			provider: ELEVENLABS_PROVIDER_ID,
			model: meta?.model ?? null,
			nativeResponseId: meta?.nativeResponseId ?? id,
			output,
			...(usage ? { usage } : {}),
		}), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}

	if (provider === MINIMAX_PROVIDER_ID || minimaxTaskId) {
		const taskId = minimaxTaskId ?? id;
		const res = await fetchMiniMaxTask(taskId);
		if (!(res instanceof Response)) return res;
		const json = await res.clone().json().catch(() => null);
		if (!res.ok) {
			if (json) {
				return new Response(JSON.stringify(json), {
					status: res.status,
					headers: { "Content-Type": "application/json" },
				});
			}
			return res;
		}
		const statusRaw = json?.status ?? json?.task_status ?? json?.data?.status;
		const status = mapMiniMaxTaskStatus(statusRaw);
		const { output, totalDurationSeconds } = parseMiniMaxOutput(json);
		const usage =
			status === "completed"
				? {
					output_audio_count: output.filter((item) => item.audio_url).length,
					...(totalDurationSeconds > 0 ? { output_audio_seconds: totalDurationSeconds } : {}),
				}
				: undefined;

		const body = {
			id,
			object: "music",
			status,
			provider: MINIMAX_PROVIDER_ID,
			model: json?.model ?? meta?.model ?? null,
			nativeResponseId: taskId,
			result: json,
			output,
			...(usage ? { usage } : {}),
		};
		return new Response(JSON.stringify(body), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	}

	const res = await fetchSunoTask(id);
	if (!(res instanceof Response)) return res;
	const json = await res.clone().json().catch(() => null);
	if (!res.ok) {
		if (json) {
			return new Response(JSON.stringify(json), {
				status: res.status,
				headers: { "Content-Type": "application/json" },
			});
		}
		return res;
	}

	const statusRaw = json?.data?.status ?? json?.status ?? null;
	const status = mapSunoTaskStatus(statusRaw);
	const { output, totalDurationSeconds } = parseSunoOutput(json);
	const usage =
		status === "completed"
			? {
				output_audio_count: output.filter((item) => item.audio_url).length,
				...(totalDurationSeconds > 0 ? { output_audio_seconds: totalDurationSeconds } : {}),
			}
			: undefined;

	const body = {
		id,
		object: "music",
		status,
		provider: SUNO_PROVIDER_ID,
		model: meta?.model ?? null,
		nativeResponseId: id,
		result: json,
		output,
		...(usage ? { usage } : {}),
	};

	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "Content-Type": "application/json" },
	});
}));
