import type { IRAudioSpeechRequest } from "@core/ir";
import { readStreamTextWithLimit } from "@core/bounded-stream";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import { resolveProviderKey } from "@providers/keys";
import { getBindings } from "@/runtime/env";
import { fetchUpstream } from "@executors/_shared/timing/upstream";

const MODELS = new Set(["minimax-speech-2.8-hd", "minimax-speech-2.8-turbo"]);
const MIME: Record<string, string> = { mp3: "audio/mpeg", wav: "audio/wav", flac: "audio/flac", pcm: "audio/pcm" };

export function isMiniMaxSpeechModel(model: string): boolean { return MODELS.has(model); }

function failure(status: number, message: string, terminal = false): Extract<ExecutorResult, { kind: "completed" }> {
	return { kind: "completed", localClientError: status === 400, terminal,
		upstream: Response.json({ error: { type: status === 400 ? "invalid_request_error" : "upstream_error", message } }, { status }),
		bill: { cost_cents: 0, currency: "USD" } };
}

export async function executeMiniMaxSpeech(args: ExecutorExecuteArgs, model: string): Promise<ExecutorResult> {
	const ir = args.ir as IRAudioSpeechRequest;
	const format = ir.responseFormat ?? ir.format ?? "mp3";
	const voice = typeof ir.voice === "string" ? ir.voice.trim() : undefined;
	if (!MODELS.has(model) || !Object.hasOwn(MIME, format) || !voice || ir.streamFormat === "sse" || ir.instructions !== undefined
		|| ir.vendor && Object.values(ir.vendor).some(value => value !== undefined)
		|| ir.input.length === 0 || ir.input.length >= 10_000
		|| ir.speed !== undefined && (!Number.isFinite(ir.speed) || ir.speed < 0.5 || ir.speed > 2)) {
		return failure(400, "Novita MiniMax Speech requires text under 10,000 characters, a voice ID, mp3/wav/flac/pcm, and speed 0.5–2. SSE, instructions and vendor controls are unsupported.");
	}
	const bindings = getBindings() as unknown as Record<string, string | undefined>;
	const key = resolveProviderKey({ providerId: args.providerId, byokMeta: args.byokMeta, forceGatewayKey: args.meta.forceGatewayKey }, () => bindings.NOVITA_API_KEY);
	const body = { text: ir.input, stream: false, output_format: "hex", voice_setting: { voice_id: voice, ...(ir.speed !== undefined ? { speed: ir.speed } : {}) }, audio_setting: { format } };
	const common = { keySource: key.source, byokKeyId: key.byokId,
		...(args.meta.echoUpstreamRequest || args.meta.returnUpstreamRequest ? { mappedRequest: JSON.stringify(body) } : {}),
	};
	let upstream: Response;
	try {
		upstream = await fetchUpstream(args, `https://api.novita.ai/v3/${model}`, {
			method: "POST", headers: { Authorization: `Bearer ${key.key}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
		});
	} catch {
		return { ...failure(502, "Novita speech submission outcome is uncertain; do not automatically resubmit.", true), ...common };
	}
	if (!upstream.ok) return { kind: "completed", terminal: upstream.status >= 500 || upstream.status === 408, upstream, ...common, bill: { cost_cents: 0, currency: "USD" } };
	let json: any;
	try { json = JSON.parse(await readStreamTextWithLimit(upstream.body, 16 * 1024 * 1024, "novita_speech_response_too_large")); }
	catch { return { ...failure(502, "Novita returned invalid or oversized speech output.", true), ...common }; }
	const code = json?.base_resp?.status_code;
	if (typeof code === "number" && code !== 0) {
		const status = code === 1001 ? 504 : [1002, 1039].includes(code) ? 429 : code === 1004 ? 401 : [1042, 2013].includes(code) ? 400 : 502;
		return { ...failure(status, typeof json.base_resp.status_msg === "string" ? json.base_resp.status_msg : "Novita speech synthesis failed.", status >= 500), localClientError: false, ...common };
	}
	const hex = json?.data?.audio;
	const characters = json?.extra_info?.usage_characters;
	if (code !== 0 || json?.data?.status !== 2 || typeof hex !== "string" || !hex.length || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)
		|| !Number.isSafeInteger(characters) || characters < 0) {
		return { ...failure(502, "Novita returned incomplete speech output or invalid billing usage.", true), ...common };
	}
	const bytes = new Uint8Array(hex.length / 2);
	for (let index = 0; index < bytes.length; index++) bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
	const audio = new Response(bytes, { headers: { "Content-Type": MIME[format] } });
	const bill = { cost_cents: 0, currency: "USD", usage: { input_characters: characters, requests: 1 }, upstream_id: typeof json.trace_id === "string" ? json.trace_id : null };
	// Novita completes synchronously; expose the decoded bytes through Phaseo's binary speech surface.
	return { kind: "stream", ...common, upstream: audio, stream: audio.body!, bill, usageFinalizer: async () => bill };
}
