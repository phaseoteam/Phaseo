import type { IRDecisionsRequest } from "@core/ir";
import { DecisionsSchema } from "@core/schemas";
import type { ExecutorExecuteArgs, ExecutorResult, ProviderExecutor } from "@executors/types";
import { completeSystemOne } from "@executors/_shared/decisions/systemone";
import { runCloudflareModel, unwrapCloudflareResult } from "../shared";
import { prepareClefOmniMedia } from "./media";

function invalidRequest(args: ExecutorExecuteArgs, message: string): ExecutorResult {
	return {
		kind: "completed", terminal: true, localClientError: true,
		upstream: Response.json({ error: "unsupported_decision_request", message, request_id: args.requestId }, { status: 400 }),
		bill: { cost_cents: 0, currency: "USD" },
	};
}

export const executor: ProviderExecutor = async args => {
	const ir = args.ir as IRDecisionsRequest;
	const upstreamModel = args.providerModelSlug?.trim();
	const omni = upstreamModel === "@cf/cloudflare/clef-omni";
	if (!omni && upstreamModel !== "@cf/cloudflare/clef" && upstreamModel !== "@cf/cloudflare/clef-flash") {
		return invalidRequest(args, "The Cloudflare decisions route must select Clef, Clef Flash, or Clef Omni.");
	}
	if (!omni && (ir.audio?.length || ir.videos?.length)) return invalidRequest(args, "Audio and video decisions require Clef Omni.");
	const entries = Object.entries(ir.questions);
	if (!entries.length || entries.length > 64 || entries.some(([id]) => !/^[A-Za-z0-9_.-]{1,100}$/.test(id))) {
		return invalidRequest(args, "Clef requires 1–64 questions with IDs of at most 100 letters, digits, underscores, dots, or hyphens.");
	}
	for (const [, question] of entries) {
		const count = Object.keys(question.criteria ?? {}).length;
		if (question.type === "choice" && (count < 2 || count > 255)) {
			return invalidRequest(args, "Clef choice questions require 2–255 options.");
		}
		if (question.type === "score" && (count < 2 || count > 10)) {
			return invalidRequest(args, "Clef score questions require 2–10 levels.");
		}
	}
	if (ir.images?.length) {
		if (!DecisionsSchema.safeParse(ir).success) return invalidRequest(args, "Clef images must be embedded PNG, JPEG, or WebP base64 data, with at most four images.");
		let total = 0;
		for (const image of ir.images) {
			const base64 = typeof image === "string" ? image.slice(image.indexOf(",") + 1) : image.base64;
			if (base64.length > 4 * Math.ceil(4 * 1024 * 1024 / 3)) {
				return invalidRequest(args, "Clef accepts at most 4 MiB per image.");
			}
			let bytes: number;
			try { bytes = atob(base64).length; } catch { return invalidRequest(args, "Image data must be valid base64."); }
			total += bytes;
			if (bytes > 4 * 1024 * 1024 || total > 8 * 1024 * 1024) {
				return invalidRequest(args, "Clef accepts at most 4 MiB per image and 8 MiB of decoded images per request.");
			}
		}
	}
	let media: Awaited<ReturnType<typeof prepareClefOmniMedia>> = {};
	if (omni) {
		try { media = await prepareClefOmniMedia(ir, args); } catch (error) {
			const code = error instanceof Error ? error.message : "";
			if (code.startsWith("remote_media_url_rejected") || code === "remote_media_redirect_rejected") {
				return invalidRequest(args, "Media URLs and redirect targets must use public HTTPS addresses.");
			}
			if (code.startsWith("remote_media_fetch_failed") || (error instanceof Error && error.name === "AbortError")) {
				return invalidRequest(args, "Unable to retrieve remote media. Check that the media server is available and responds within the download timeout.");
			}
			return invalidRequest(args, "Clef Omni accepts up to four WAV/MP3 audio clips (8 MiB each) and two MP4/WebM videos, with at most 16 MiB combined audio/video. Use valid base64 or public HTTPS URLs with the matching Content-Type.");
		}
	}
	const body = JSON.stringify({
		model: upstreamModel.slice("@cf/cloudflare/".length), state: ir.state, questions: ir.questions,
		...(ir.images?.length ? { images: ir.images } : {}),
		...media,
	});
	const maxBodyMiB = omni ? 37 : 13;
	if (new TextEncoder().encode(body).byteLength > maxBodyMiB * 1024 * 1024) {
		return invalidRequest(args, `Clef request bodies must be at most ${maxBodyMiB} MiB.`);
	}
	const { response, keySource, byokKeyId } = await runCloudflareModel(args, body, "application/json");
	return completeSystemOne(args, response, { source: keySource, byokId: byokKeyId },
		args.meta.returnUpstreamRequest || args.meta.echoUpstreamRequest ? body : undefined,
		payload => {
			if (payload && typeof payload === "object" && "success" in payload && payload.success === false) return null;
			return unwrapCloudflareResult(payload);
		});
};
