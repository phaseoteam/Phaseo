// Purpose: Fireworks FLUX image generation.
// Why: Fireworks serves FLUX from its workflows text_to_image endpoint, not an OpenAI-style
// /images/generations route.
// How: Maps the OpenAI images request to the documented workflow body, reads the image bytes
// Fireworks returns and wraps them as an OpenAI images response with one output_image.
// Docs: https://huggingface.co/fireworks-ai/FLUX.1-schnell-fp8-flumina (Fireworks' published
// example: POST /inference/v1/workflows/accounts/fireworks/models/flux-1-schnell-fp8/text_to_image
// with Accept: image/jpeg and a JSON body of prompt, aspect_ratio, guidance_scale,
// num_inference_steps and seed).

import { ImagesGenerationSchema } from "@core/schemas";
import type { AdapterResult, ProviderExecuteArgs } from "../types";
import { resolveOpenAITransport } from "../shared/openai-transport";
import { upstreamTestHeaders } from "../shared/testing";

const ACCEPT_BY_FORMAT = { jpeg: "image/jpeg", png: "image/png" } as const;

function invalid(param: string, message: string): AdapterResult {
	return {
		kind: "completed",
		upstream: Response.json({ error: { type: "invalid_request_error", param, message } }, { status: 400 }),
		bill: { cost_cents: 0, currency: "USD" },
	};
}

/** `flux-1-schnell-fp8` or `fireworks/flux-1-schnell-fp8` -> `accounts/fireworks/models/flux-1-schnell-fp8`. */
export function fireworksWorkflowModelPath(model: string): string {
	const trimmed = model.trim().replace(/^\/+|\/+$/g, "");
	if (trimmed.startsWith("accounts/")) return trimmed;
	const name = trimmed.split("/").pop() ?? trimmed;
	return `accounts/fireworks/models/${name}`;
}

function gcd(a: number, b: number): number {
	return b === 0 ? a : gcd(b, a % b);
}

/** `1280x720` -> `16:9`. Returns undefined when the size is not WIDTHxHEIGHT. */
export function sizeToAspectRatio(size: string | undefined): string | undefined {
	const match = /^\s*(\d+)\s*[x×]\s*(\d+)\s*$/i.exec(size ?? "");
	if (!match) return undefined;
	const width = Number(match[1]);
	const height = Number(match[2]);
	if (!(width > 0 && height > 0)) return undefined;
	const divisor = gcd(width, height);
	return `${width / divisor}:${height / divisor}`;
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = "";
	for (let index = 0; index < bytes.length; index += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
	}
	return btoa(binary);
}

export async function exec(args: ProviderExecuteArgs): Promise<AdapterResult> {
	const body = ImagesGenerationSchema.parse(args.body);
	const model = args.providerModelSlug || body.model;
	const modelPath = fireworksWorkflowModelPath(model);
	if (/flux-kontext/i.test(modelPath)) {
		return invalid("model", "Fireworks FLUX Kontext models are not available for image generation.");
	}
	if (body.stream) return invalid("stream", "Fireworks FLUX image generation does not support streaming.");
	if (body.n != null && body.n !== 1) return invalid("n", "Fireworks FLUX generates one image per request.");
	if (body.response_format && body.response_format !== "b64_json") {
		return invalid("response_format", "Fireworks FLUX returns image data only; use response_format=\"b64_json\".");
	}
	const outputFormat = body.output_format ?? "jpeg";
	if (outputFormat !== "jpeg" && outputFormat !== "png") {
		return invalid("output_format", "Fireworks FLUX supports output_format \"jpeg\" or \"png\".");
	}
	const sizeRatio = sizeToAspectRatio(body.size ?? body.resolution);
	if ((body.size ?? body.resolution) && !sizeRatio && !body.aspect_ratio) {
		return invalid("size", "Fireworks FLUX needs size as WIDTHxHEIGHT, or an aspect_ratio such as \"16:9\".");
	}
	const aspectRatio = body.aspect_ratio ?? sizeRatio;

	// num_inference_steps is left at Fireworks' default: the per-image price assumes it.
	const request: Record<string, unknown> = {
		prompt: body.prompt,
		...(aspectRatio ? { aspect_ratio: aspectRatio } : {}),
		...(typeof body.seed === "number" ? { seed: body.seed } : {}),
	};
	const { keyInfo, url, headers } = resolveOpenAITransport(
		args,
		`/workflows/${modelPath}/text_to_image`,
		{ Accept: ACCEPT_BY_FORMAT[outputFormat], ...upstreamTestHeaders(args.meta) },
	);
	const upstream = await (args.upstreamTiming?.fetch ?? fetch)(url, {
		method: "POST",
		headers,
		body: JSON.stringify(request),
	});
	const bill = {
		cost_cents: 0,
		currency: "USD",
		usage: undefined as Record<string, number> | undefined,
		upstream_id: upstream.headers.get("x-request-id"),
		finish_reason: null,
	};
	const keys = { keySource: keyInfo.source, byokKeyId: keyInfo.byokId };
	if (!upstream.ok) return { kind: "completed", upstream, bill, ...keys };

	const contentType = String(upstream.headers.get("content-type") ?? "").split(";", 1)[0]!.trim().toLowerCase();
	const bytes = contentType.startsWith("image/")
		? new Uint8Array(await upstream.clone().arrayBuffer().catch(() => new ArrayBuffer(0)))
		: new Uint8Array(0);
	if (bytes.byteLength === 0) {
		return {
			kind: "completed",
			upstream: Response.json(
				{ error: { type: "invalid_upstream_response", message: "Fireworks returned no image data." } },
				{ status: 502 },
			),
			bill,
			...keys,
		};
	}

	bill.usage = { output_image: 1 };
	const normalized = {
		created: Math.floor(Date.now() / 1000),
		output_format: contentType === "image/png" ? "png" : "jpeg",
		...(aspectRatio && body.size ? { size: body.size } : {}),
		data: [{ b64_json: bytesToBase64(bytes) }],
	};
	return { kind: "completed", upstream, normalized, bill, ...keys };
}
