// Purpose: Executor for openai / image-generate.
// Why: Isolates provider-specific behavior per capability.
// How: Transforms IR and calls the provider API for this capability.

// OpenAI Image Generation Executor
// Documentation: https://platform.openai.com/docs/guides/images
// Supports DALL-E 3 and DALL-E 2 models
// NOTE: DALL-E 3 is scheduled for deprecation on May 12, 2026

import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import type { ProviderExecutor } from "../../types";

/**
 * OpenAI Image Generation Executor
 *
 * Handles image generation requests through OpenAI's images API
 * Supports models:
 * - dall-e-3 (1024x1024, 1024x1792, 1792x1024) - HD quality, vivid/natural styles
 * - dall-e-2 (256x256, 512x512, 1024x1024) - Legacy model
 */
export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const { ir, providerId, providerModelSlug, requestId, byokMeta } = args;

	// Resolve API key (BYOK or gateway-provided)
	const apiKey = byokMeta?.[0]?.value || process.env.OPENAI_API_KEY;
	if (!apiKey) {
		return {
			kind: "completed",
			ir: null,
			upstream: new Response(JSON.stringify({ error: "Missing OpenAI API key" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			}),
			bill: { cost_cents: 0, currency: "USD" },
		};
	}

	// Extract prompt from IR
	// For image generation, ir.messages[0].content should contain the prompt
	const prompt = typeof ir.messages?.[0]?.content === "string"
		? ir.messages[0].content
		: Array.isArray(ir.messages?.[0]?.content)
			? ir.messages[0].content
				.filter((p: any) => p.type === "text")
				.map((p: any) => p.text)
				.join(" ")
			: "";

	if (!prompt) {
		return {
			kind: "completed",
			ir: null,
			upstream: new Response(JSON.stringify({ error: "Prompt is required for image generation" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			}),
			bill: { cost_cents: 0, currency: "USD" },
		};
	}

	// Determine model (dall-e-3 or dall-e-2)
	const model = providerModelSlug || ir.model || "dall-e-3";

	// Build OpenAI request
	const openaiRequest: any = {
		model,
		prompt,
		n: 1, // DALL-E 3 only supports n=1
	};

	// Map size parameter from IR (vendor-specific or common width/height)
	const size = (ir as any).size ||
		(typeof (ir as any).width === "number" && typeof (ir as any).height === "number"
			? `${(ir as any).width}x${(ir as any).height}`
			: model === "dall-e-3" ? "1024x1024" : "512x512");
	openaiRequest.size = size;

	// DALL-E 3 specific parameters
	if (model === "dall-e-3") {
		// Quality: standard or hd
		if ((ir as any).quality) {
			openaiRequest.quality = (ir as any).quality;
		}
		// Style: vivid or natural
		if ((ir as any).style) {
			openaiRequest.style = (ir as any).style;
		}
	}

	// Response format: url or b64_json
	const responseFormat = (ir as any).response_format || "url";
	openaiRequest.response_format = responseFormat;

	// User ID for abuse detection
	if (ir.userId) {
		openaiRequest.user = ir.userId;
	}

	try {
		const response = await fetch("https://api.openai.com/v1/images/generations", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Bearer ${apiKey}`,
			},
			body: JSON.stringify(openaiRequest),
		});

		if (!response.ok) {
			return {
				kind: "completed",
				ir: null,
				upstream: response,
				bill: { cost_cents: 0, currency: "USD" },
			};
		}

		const data = await response.json();

		// Transform OpenAI response to IR-like structure
		// OpenAI returns: { created, data: [{ url?, b64_json?, revised_prompt? }] }
		const images = data.data?.map((img: any) => ({
			url: img.url || null,
			b64_json: img.b64_json || null,
			revised_prompt: img.revised_prompt || null,
		})) || [];

		const irResponse: any = {
			id: requestId,
			nativeId: data.id,
			created: data.created || Math.floor(Date.now() / 1000),
			model,
			provider: "openai",
			images,
		};

		// Calculate approximate cost (in cents)
		// DALL-E 3: ~$0.040 (standard 1024x1024), ~$0.080 (hd 1024x1024)
		// DALL-E 2: ~$0.020 (1024x1024), ~$0.018 (512x512), ~$0.016 (256x256)
		let costCents = 0;
		if (model === "dall-e-3") {
			if (openaiRequest.quality === "hd") {
				costCents = size === "1024x1792" || size === "1792x1024" ? 12 : 8; // $0.12 or $0.08
			} else {
				costCents = size === "1024x1792" || size === "1792x1024" ? 8 : 4; // $0.08 or $0.04
			}
		} else if (model === "dall-e-2") {
			if (size === "1024x1024") costCents = 2;
			else if (size === "512x512") costCents = 1.8;
			else costCents = 1.6;
		}

		return {
			kind: "completed",
			ir: irResponse,
			upstream: response,
			bill: {
				cost_cents: costCents,
				currency: "USD",
			},
		};
	} catch (error: any) {
		return {
			kind: "completed",
			ir: null,
			upstream: new Response(JSON.stringify({ error: error.message }), {
				status: 500,
				headers: { "Content-Type": "application/json" },
			}),
			bill: { cost_cents: 0, currency: "USD" },
		};
	}
}

export const executor: ProviderExecutor = execute;

