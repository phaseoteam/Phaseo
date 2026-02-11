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
import { getMusicJobMeta } from "@core/music-jobs";
import { withRuntime } from "../../utils";

const musicGenerateHandler = makeEndpointHandler({ endpoint: "music.generate", schema: MusicGenerateSchema });
const SUNO_PROVIDER_ID = "suno";

export const musicGenerateRoutes = new Hono<Env>();

musicGenerateRoutes.post("/", withRuntime(musicGenerateHandler));

function mapSunoTaskStatus(value: unknown): "queued" | "in_progress" | "completed" | "failed" {
	const status = String(value ?? "").trim().toUpperCase();
	if (status === "SUCCESS" || status === "SUCCEEDED" || status === "COMPLETED") return "completed";
	if (status === "PENDING" || status === "TEXT_SUCCESS" || status === "FIRST_SUCCESS" || status === "RUNNING") {
		return "in_progress";
	}
	if (status === "CREATE_TASK_FAILED" || status === "CALLBACK_EXCEPTION" || status === "FAILED") return "failed";
	return "queued";
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
	const tracks: any[] =
		(Array.isArray(json?.data?.response?.sunoData) ? json.data.response.sunoData : []) ??
		(Array.isArray(json?.data?.sunoData) ? json.data.sunoData : []) ??
		[];
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
	if (provider !== SUNO_PROVIDER_ID) {
		return err("not_supported", {
			reason: "music_status_only_supported_for_suno",
			request_id: auth.value.requestId,
			team_id: auth.value.teamId,
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
				output_audio_count: output.length,
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
