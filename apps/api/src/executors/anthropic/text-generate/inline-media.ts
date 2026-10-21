// Purpose: Inline URL images and documents for Claude on Bedrock and Vertex AI.
// Why: "On Amazon Bedrock and Google Cloud, only base64-encoded sources are
//      currently available", and the Files API is not offered there either.
//      https://platform.claude.com/docs/en/build-with-claude/vision
//      https://platform.claude.com/docs/en/build-with-claude/pdf-support
//      https://platform.claude.com/docs/en/build-with-claude/files
// How: Download each URL source (SSRF-safe, size-capped), check Claude's image
//      types and size limits, and send base64 instead. File references and
//      media that cannot be inlined end the request with a clear 400.

import type { IRChatRequest, IRContentPart, IRMessage } from "@core/ir";
import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import {
	fetchRemoteMediaInline,
	isHttpUrl,
	mediaInputErrorResult,
	parseBase64DataUrl,
	shortMediaUrl,
} from "@executors/_shared/media/remote-media";

// Claude accepts JPEG, PNG, GIF and WebP images of up to 5 MB each through the
// API, and PDFs within the 32 MB request limit.
export const CLAUDE_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
export const CLAUDE_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const CLAUDE_MAX_DOCUMENT_BYTES = 32 * 1024 * 1024;

class InlineMediaError extends Error {
	constructor(readonly code: string, message: string) {
		super(message);
	}
}

function platformName(providerId: string | undefined): string {
	return providerId?.startsWith("google-vertex") ? "Vertex AI" : "Amazon Bedrock";
}

type Context = { platform: string; upstreamTiming?: ExecutorExecuteArgs["upstreamTiming"] };

async function inlineImage(part: Extract<IRContentPart, { type: "image" }>, ctx: Context): Promise<IRContentPart> {
	if (part.source === "data") return part;
	if (part.source === "id") {
		throw new InlineMediaError(
			"unsupported_parameter",
			`Claude on ${ctx.platform} cannot read Files API uploads. Send the image as base64 data or a URL, or use a Claude API route.`,
		);
	}
	const dataUrl = parseBase64DataUrl(part.data);
	if (dataUrl) return { ...part, source: "data", data: dataUrl.data, mimeType: dataUrl.mimeType };
	if (!isHttpUrl(part.data)) {
		throw new InlineMediaError("invalid_image_url", `Image URL ${shortMediaUrl(part.data)} is not an http(s) URL.`);
	}
	const fetched = await fetchRemoteMediaInline(part.data, {
		fallbackMimeType: part.mimeType || "image/jpeg",
		maxBytes: CLAUDE_MAX_IMAGE_BYTES,
		upstreamTiming: ctx.upstreamTiming,
	});
	if (fetched.ok === false) {
		throw new InlineMediaError(
			fetched.reason === "too_large" ? "image_too_large" : "invalid_image_url",
			fetched.reason === "too_large"
				? `Image ${shortMediaUrl(part.data)} is larger than Claude's 5 MB limit.`
				: `Could not download image ${shortMediaUrl(part.data)}. Claude on ${ctx.platform} takes images as base64 data, so the gateway must be able to fetch the URL.`,
		);
	}
	if (!CLAUDE_IMAGE_MIME_TYPES.has(fetched.mimeType)) {
		throw new InlineMediaError(
			"unsupported_image_type",
			`Image ${shortMediaUrl(part.data)} is ${fetched.mimeType}; Claude accepts image/jpeg, image/png, image/gif and image/webp.`,
		);
	}
	return { ...part, source: "data", data: fetched.data, mimeType: fetched.mimeType };
}

async function inlineFile(part: Extract<IRContentPart, { type: "file" }>, ctx: Context): Promise<IRContentPart> {
	if (part.source === "id") {
		throw new InlineMediaError(
			"unsupported_parameter",
			`Claude on ${ctx.platform} cannot read Files API uploads. Send the document as base64 data or a URL, or use a Claude API route.`,
		);
	}
	if (part.source === "data") return part;
	const dataUrl = parseBase64DataUrl(part.data);
	let mimeType: string;
	let data: string;
	if (dataUrl) {
		mimeType = dataUrl.mimeType;
		data = dataUrl.data;
	} else {
		if (!isHttpUrl(part.data)) {
			throw new InlineMediaError("invalid_file_url", `Document URL ${shortMediaUrl(part.data)} is not an http(s) URL.`);
		}
		const fetched = await fetchRemoteMediaInline(part.data, {
			fallbackMimeType: "application/pdf",
			maxBytes: CLAUDE_MAX_DOCUMENT_BYTES,
			upstreamTiming: ctx.upstreamTiming,
		});
		if (fetched.ok === false) {
			throw new InlineMediaError(
				fetched.reason === "too_large" ? "file_too_large" : "invalid_file_url",
				fetched.reason === "too_large"
					? `Document ${shortMediaUrl(part.data)} is larger than Claude's 32 MB request limit.`
					: `Could not download document ${shortMediaUrl(part.data)}. Claude on ${ctx.platform} takes documents as base64 data, so the gateway must be able to fetch the URL.`,
			);
		}
		mimeType = fetched.mimeType;
		data = fetched.data;
	}
	if (mimeType !== "application/pdf" && !mimeType.startsWith("text/")) {
		throw new InlineMediaError(
			"unsupported_file_type",
			`Document ${shortMediaUrl(part.data)} is ${mimeType}; Claude reads PDF and plain-text documents.`,
		);
	}
	const inlined: Extract<IRContentPart, { type: "file" }> = { ...part, source: "data", data, mimeType };
	if (part.nativeBlock) {
		// The executor turns base64 text/* into a `text` source.
		const { nativeBlock: _native, ...rest } = inlined;
		const { source: _source, ...blockFields } = part.nativeBlock;
		return {
			...rest,
			nativeBlock: mimeType === "application/pdf"
				? { ...blockFields, source: { type: "base64", media_type: mimeType, data } }
				: undefined,
		};
	}
	return inlined;
}

async function inlinePart(part: IRContentPart, ctx: Context): Promise<IRContentPart> {
	if (part.type === "image") return inlineImage(part, ctx);
	if (part.type === "file") return inlineFile(part, ctx);
	return part;
}

async function inlineParts(parts: IRContentPart[], ctx: Context): Promise<IRContentPart[]> {
	const next: IRContentPart[] = [];
	for (const part of parts) next.push(await inlinePart(part, ctx));
	return next;
}

function needsInlining(part: IRContentPart): boolean {
	return (part.type === "image" || part.type === "file") && part.source !== "data";
}

function messageNeedsInlining(message: IRMessage): boolean {
	if (message.role === "tool") return message.toolResults.some((result) => result.parts?.some(needsInlining));
	return message.content.some(needsInlining);
}

/**
 * The request with every URL image and document inlined as base64, or a 400
 * result when one cannot be sent to Claude on Bedrock or Vertex AI. Returns
 * the request itself when nothing needs inlining.
 */
export async function inlineClaudeMediaForBase64OnlyPlatform(
	ir: IRChatRequest,
	args: Pick<ExecutorExecuteArgs, "providerId" | "requestId" | "upstreamTiming">,
): Promise<{ ok: true; ir: IRChatRequest } | { ok: false; result: ExecutorResult }> {
	if (!ir.messages.some(messageNeedsInlining)) return { ok: true, ir };
	const ctx: Context = { platform: platformName(args.providerId), upstreamTiming: args.upstreamTiming };
	try {
		const messages: IRMessage[] = [];
		for (const message of ir.messages) {
			if (!messageNeedsInlining(message)) {
				messages.push(message);
			} else if (message.role === "tool") {
				const toolResults = [];
				for (const result of message.toolResults) {
					toolResults.push(result.parts ? { ...result, parts: await inlineParts(result.parts, ctx) } : result);
				}
				messages.push({ ...message, toolResults });
			} else {
				messages.push({ ...message, content: await inlineParts(message.content, ctx) } as IRMessage);
			}
		}
		return { ok: true, ir: { ...ir, messages } };
	} catch (error) {
		if (error instanceof InlineMediaError) {
			return { ok: false, result: mediaInputErrorResult(error.code, error.message, args.requestId) };
		}
		throw error;
	}
}
