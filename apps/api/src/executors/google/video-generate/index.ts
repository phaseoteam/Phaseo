// Purpose: Executor for google / video-generate.
// Why: Isolates provider-specific behavior per capability.
// How: Transforms IR and calls the provider API for this capability.

// Google Veo Video Generation Executor
// Documentation: https://ai.google.dev/gemini-api/docs/video
// Supports Veo 3.1 and Veo 2 models via Gemini API

import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import type { ProviderExecutor } from "../../types";

/**
 * Google Veo Video Generation Executor
 *
 * Handles video generation requests through Google's Gemini API (Veo models)
 * Supports models:
 * - veo-3.1-generate-preview - Latest model with audio, 720p/1080p/4k
 * - veo-3.1-fast-generate-preview - Speed-optimized version
 * - veo-2.0-generate-001 - Stable model, 720p only, no audio
 *
 * Features:
 * - Text-to-video generation (up to 8 seconds)
 * - Image-to-video animation
 * - Video extension
 * - Reference images for style/content guidance
 * - Multiple aspect ratios (16:9, 9:16)
 * - Multiple resolutions (720p, 1080p, 4k)
 *
 * NOTE: Uses long-running operations - requires polling for completion
 */
export async function execute(args: ExecutorExecuteArgs): Promise<ExecutorResult> {
	const { ir, providerId, providerModelSlug, requestId, byokMeta } = args;

	// Resolve API key (BYOK or gateway-provided)
	const apiKey = byokMeta?.[0]?.value || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_STUDIO_API_KEY;
	if (!apiKey) {
		return {
			kind: "completed",
			ir: null,
			upstream: new Response(JSON.stringify({ error: "Missing Google API key" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			}),
			bill: { cost_cents: 0, currency: "USD" },
		};
	}

	// Extract prompt from IR
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
			upstream: new Response(JSON.stringify({ error: "Prompt is required for video generation" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			}),
			bill: { cost_cents: 0, currency: "USD" },
		};
	}

	// Determine model
	const model = providerModelSlug || ir.model || "veo-3.1-generate-preview";

	// Build Google Veo request
	const instances = [{
		prompt,
	}];

	// Add optional image for image-to-video
	const imageContent = Array.isArray(ir.messages?.[0]?.content)
		? ir.messages[0].content.find((p: any) => p.type === "image")
		: null;

	if (imageContent) {
		instances[0].image = {
			bytesBase64Encoded: imageContent.source === "data"
				? imageContent.data
				: null, // TODO: Fetch URL and convert to base64
		};
	}

	// Build parameters
	const parameters: any = {};

	// Aspect ratio: 16:9 or 9:16
	if ((ir as any).aspect_ratio) {
		parameters.aspectRatio = (ir as any).aspect_ratio;
	}

	// Resolution: 720p, 1080p, or 4k (Veo 3.1 only)
	if ((ir as any).resolution) {
		parameters.resolution = (ir as any).resolution;
	}

	// Duration: 4, 6, or 8 seconds
	if (typeof (ir as any).duration_seconds === "number") {
		parameters.durationSeconds = String((ir as any).duration_seconds);
	}

	// Negative prompt
	if ((ir as any).negative_prompt) {
		parameters.negativePrompt = (ir as any).negative_prompt;
	}

	// Reference images (up to 3 for Veo 3.1)
	if ((ir as any).reference_images && Array.isArray((ir as any).reference_images)) {
		parameters.referenceImages = (ir as any).reference_images;
	}

	const requestBody = {
		instances,
		parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
	};

	try {
		// Step 1: Start long-running operation
		const initiateResponse = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-goog-api-key": apiKey,
				},
				body: JSON.stringify(requestBody),
			}
		);

		if (!initiateResponse.ok) {
			return {
				kind: "completed",
				ir: null,
				upstream: initiateResponse,
				bill: { cost_cents: 0, currency: "USD" },
			};
		}

		const operationData = await initiateResponse.json();
		const operationName = operationData.name;

		if (!operationName) {
			return {
				kind: "completed",
				ir: null,
				upstream: new Response(JSON.stringify({ error: "No operation name returned" }), {
					status: 500,
					headers: { "Content-Type": "application/json" },
				}),
				bill: { cost_cents: 0, currency: "USD" },
			};
		}

		// Step 2: Poll operation until complete
		// NOTE: This is a simplified implementation. In production, you would:
		// 1. Return the operation to the client for async polling
		// 2. Use webhooks for completion notification
		// 3. Implement server-side polling with proper timeouts

		let attempts = 0;
		const maxAttempts = 60; // 10 minutes max (10s * 60)
		let operationComplete = false;
		let finalResponse: any = null;

		while (!operationComplete && attempts < maxAttempts) {
			// Wait before polling
			if (attempts > 0) {
				await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds
			}

			const statusResponse = await fetch(
				`https://generativelanguage.googleapis.com/v1beta/${operationName}`,
				{
					method: "GET",
					headers: {
						"x-goog-api-key": apiKey,
					},
				}
			);

			if (!statusResponse.ok) {
				return {
					kind: "completed",
					ir: null,
					upstream: statusResponse,
					bill: { cost_cents: 0, currency: "USD" },
				};
			}

			const statusData = await statusResponse.json();

			if (statusData.done === true) {
				operationComplete = true;
				finalResponse = statusData;
			}

			attempts++;
		}

		if (!operationComplete) {
			return {
				kind: "completed",
				ir: null,
				upstream: new Response(JSON.stringify({ error: "Video generation timed out after 10 minutes" }), {
					status: 504,
					headers: { "Content-Type": "application/json" },
				}),
				bill: { cost_cents: 0, currency: "USD" },
			};
		}

		// Extract video URLs from response
		const generatedSamples = finalResponse?.response?.generateVideoResponse?.generatedSamples || [];
		const videos = generatedSamples.map((sample: any) => ({
			uri: sample.video?.uri || null,
		}));

		const irResponse: any = {
			id: requestId,
			created: Math.floor(Date.now() / 1000),
			model,
			provider: "google",
			videos,
			operationName, // Include for reference
		};

		// Calculate approximate cost
		// Veo 3.1: ~$0.10 per second of video generated
		// Veo 2: Lower cost but limited features
		const durationSeconds = Number(parameters.durationSeconds) || 8;
		const costPerSecond = model.startsWith("veo-3.1") ? 10 : 5; // cents
		const costCents = durationSeconds * costPerSecond;

		return {
			kind: "completed",
			ir: irResponse,
			upstream: new Response(JSON.stringify(irResponse), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
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

