// Purpose: Executor for fal / audio-generate.
// Why: Isolates provider-specific behavior per capability.
// How: Transforms IR and calls the provider API for this capability.

// Fal.ai Audio Generation Executor
// Documentation: https://fal.ai/ | https://docs.fal.ai/
// Supports audio generation and text-to-speech models

import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import type { ProviderExecutor } from "../../types";

/**
 * Fal Audio Generation Executor
 *
 * Handles audio generation requests through Fal's unified API
 * Supports models for:
 * - Text-to-speech
 * - Music generation
 * - Audio effects
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

	// Map audio-specific parameters
	if (ir.seed) falRequest.seed = ir.seed;
	if (typeof (ir as any).duration_seconds === "number") falRequest.duration = (ir as any).duration_seconds;
	if (typeof (ir as any).voice === "string") falRequest.voice = (ir as any).voice;

	// Determine model endpoint
	const modelId = providerModelSlug || ir.model || "fal-ai/audio-tts";

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
			audio: data.audio_url || data.url || null,
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

