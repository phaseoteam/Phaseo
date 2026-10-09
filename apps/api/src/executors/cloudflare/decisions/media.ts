import { fetchPublicMedia } from "@core/public-media-fetch";
import { imageBytesToBase64 } from "@executors/_shared/image-results";
import type { IRDecisionsRequest } from "@core/ir";
import type { ExecutorExecuteArgs } from "@executors/types";

const MiB = 1024 * 1024;
const contentTypes = {
	audio: new Set(["audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3"]),
	video: new Set(["video/mp4", "video/webm"]),
};

async function embedMedia(value: string, kind: "audio" | "video", maxBytes: number, args: ExecutorExecuteArgs) {
	let base64: string;
	let contentType: string;
	if (/^data:/i.test(value)) {
		const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(value);
		if (!match) throw new Error("invalid_media");
		contentType = match[1].toLowerCase();
		base64 = match[2];
	} else {
		if (new URL(value).protocol !== "https:") throw new Error("invalid_media_url");
		const media = await fetchPublicMedia({ url: value, maxBytes, upstreamTiming: args.upstreamTiming });
		contentType = media.contentType?.split(";")[0].trim().toLowerCase() ?? "";
		base64 = imageBytesToBase64(media.bytes);
	}
	if (!contentTypes[kind].has(contentType) || base64.length > 4 * Math.ceil(maxBytes / 3)) throw new Error("invalid_media");
	const bytes = atob(base64).length;
	if (bytes === 0 || bytes > maxBytes) throw new Error("invalid_media_size");
	return { value: `data:${contentType};base64,${base64}`, bytes };
}

export async function prepareClefOmniMedia(ir: IRDecisionsRequest, args: ExecutorExecuteArgs) {
	if ((ir.audio?.length ?? 0) > 4 || (ir.videos?.length ?? 0) > 2) throw new Error("too_many_media");
	const audio: string[] = [];
	const videos: string[] = [];
	let total = 0;
	for (const clip of ir.audio ?? []) {
		const value = clip.source === "url" ? clip.data :
			`data:audio/${clip.format === "mp3" ? "mpeg" : clip.format};base64,${clip.data}`;
		const media = await embedMedia(value, "audio", Math.min(8 * MiB, 16 * MiB - total), args);
		total += media.bytes;
		audio.push(media.value);
	}
	for (const clip of ir.videos ?? []) {
		const media = await embedMedia(clip, "video", 16 * MiB - total, args);
		total += media.bytes;
		videos.push(media.value);
	}
	return { ...(audio.length ? { audio } : {}), ...(videos.length ? { videos } : {}) };
}
