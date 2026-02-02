// Purpose: Executor for fal / video-generate.
// Why: Isolates provider-specific behavior per capability.
// How: Transforms IR and calls the provider API for this capability.

// Fal.ai Video Generation Executor
// Documentation: https://fal.ai/video | https://docs.fal.ai/
// Supports models like Veo 3, Hunyuan Video, MiniMax, Mochi, Kling, etc.

import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import type { ProviderExecutor } from "../../types";

/**
 * Fal Video Generation Executor
 *
 * Handles video generation requests through Fal's unified API
 * Supports models like:
 * - fal-ai/veo3 (Google Veo 3 - most advanced)
 * - fal-ai/hunyuan-video (Open source, high quality)
 * - fal-ai/minimax-video (text-to-video)
 * - fal-ai/mochi-v1 (high quality)
 * - fal-ai/kling-video/v1/standard (image-to-video)
 * And many more
 */
export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const { ir, providerId, providerModelSlug, requestId, byokMeta } = args;

	// Resolve API key (BYOK or gateway-provided)
	const apiKey = byokMeta?.[0]?.value || process.env.FAL_API_KEY;
	if (!apiKey) {
		return {
			kind: "completed",
			ir: null,
			upstream: new Response(JSON.stringify({ error: "Missing Fal API key" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			}),
			bill: { cost_cents: 0, currency: "USD" },
		};
	}

	// Map IR to Fal API request
	const prompt = typeof ir.messages?.[0]?.content === "string"
		? ir.messages[0].content
		: Array.isArray(ir.messages?.[0]?.content)
			? ir.messages[0].content
				.filter((p: any) => p.type === "text")
				.map((p: any) => p.text)
				.join(" ")
			: "";

	// Build Fal request
	const falRequest: any = {
		prompt,
	};

	// Map video-specific parameters
	if (ir.seed) falRequest.seed = ir.seed;
	if (typeof (ir as any).duration_seconds === "number") falRequest.duration = (ir as any).duration_seconds;
	if (typeof (ir as any).fps === "number") falRequest.fps = (ir as any).fps;
	if (typeof (ir as any).image_url === "string") falRequest.image_url = (ir as any).image_url;
	if (typeof (ir as any).aspect_ratio === "string") falRequest.aspect_ratio = (ir as any).aspect_ratio;

	// Determine model endpoint
	const modelId = providerModelSlug || ir.model || "fal-ai/veo3";

	try {
		const response = await fetch(`https://fal.run/${modelId}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Authorization": `Key ${apiKey}`,
			},
			body: JSON.stringify(falRequest),
		});

		const data = await response.json();

		// Transform Fal response to IR-like structure
		const irResponse: any = {
			id: requestId,
			created: Math.floor(Date.now() / 1000),
			model: modelId,
			video: data.video || null,
			usage: {
				inputTokens: 0,
				outputTokens: 0,
				totalTokens: 0,
			},
		};

		return {
			kind: "completed",
			ir: irResponse,
			upstream: response,
			bill: {
				cost_cents: 0, // TODO: Add Fal pricing
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

