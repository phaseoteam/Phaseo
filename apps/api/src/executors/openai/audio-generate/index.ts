// Purpose: Executor for openai / audio-generate.
// Why: Isolates provider-specific behavior per capability.
// How: Transforms IR and calls the provider API for this capability.

// OpenAI Audio Generation Executor (Text-to-Speech)
// Documentation: https://platform.openai.com/docs/guides/text-to-speech
// Supports TTS models: tts-1, tts-1-hd, gpt-4o-mini-tts

import type { ExecutorExecuteArgs, ExecutorResult } from "@executors/types";
import type { ProviderExecutor } from "../../types";

/**
 * OpenAI Text-to-Speech Executor
 *
 * Handles audio generation (TTS) requests through OpenAI's audio/speech API
 * Supports models:
 * - tts-1 - Standard quality, lower latency
 * - tts-1-hd - High definition quality
 * - gpt-4o-mini-tts - Latest model with instruction support
 * - gpt-4o-mini-tts-2025-12-15 - Dated snapshot
 *
 * Available voices:
 * Built-in: alloy, ash, ballad, coral, echo, fable, onyx, nova, sage, shimmer, verse, marin, cedar
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

	// Extract text input from IR
	const input = typeof ir.messages?.[0]?.content === "string"
		? ir.messages[0].content
		: Array.isArray(ir.messages?.[0]?.content)
			? ir.messages[0].content
				.filter((p: any) => p.type === "text")
				.map((p: any) => p.text)
				.join(" ")
			: "";

	if (!input) {
		return {
			kind: "completed",
			ir: null,
			upstream: new Response(JSON.stringify({ error: "Input text is required for TTS" }), {
				status: 400,
				headers: { "Content-Type": "application/json" },
			}),
			bill: { cost_cents: 0, currency: "USD" },
		};
	}

	// Determine model
	const model = providerModelSlug || ir.model || "tts-1";

	// Build OpenAI TTS request
	const openaiRequest: any = {
		model,
		input,
		voice: (ir as any).voice || "alloy", // Default voice
	};

	// Optional: response format (mp3, opus, aac, flac, wav, pcm)
	if ((ir as any).response_format) {
		openaiRequest.response_format = (ir as any).response_format;
	}

	// Optional: speed (0.25 to 4.0, default 1.0)
	if (typeof (ir as any).speed === "number") {
		openaiRequest.speed = Math.max(0.25, Math.min(4.0, (ir as any).speed));
	}

	// Optional: instructions (only for gpt-4o-mini-tts models)
	if ((ir as any).instructions && model.startsWith("gpt-4o-mini-tts")) {
		openaiRequest.instructions = (ir as any).instructions;
	}

	try {
		const response = await fetch("https://api.openai.com/v1/audio/speech", {
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

		// OpenAI returns the audio file directly (binary data)
		// We need to convert it to a URL or base64 for the IR

		// For now, we'll return a reference to the audio data
		// In a production system, you might:
		// 1. Upload to cloud storage (S3, GCS, etc.) and return URL
		// 2. Convert to base64 and embed in response
		// 3. Stream directly to client

		const audioBuffer = await response.arrayBuffer();
		const base64Audio = Buffer.from(audioBuffer).toString("base64");
		const mimeType = response.headers.get("content-type") || "audio/mpeg";

		const irResponse: any = {
			id: requestId,
			created: Math.floor(Date.now() / 1000),
			model,
			provider: "openai",
			audio: {
				data: base64Audio,
				mimeType,
			},
			usage: {
				inputTokens: 0, // OpenAI doesn't report token usage for TTS
				outputTokens: 0,
				totalTokens: 0,
			},
		};

		// Calculate approximate cost (in cents)
		// TTS pricing: ~$15 per 1M characters
		// tts-1: $0.015 per 1K characters
		// tts-1-hd: $0.030 per 1K characters
		const charCount = input.length;
		const costPer1kChars = model === "tts-1-hd" ? 3.0 : 1.5; // cents
		const costCents = (charCount / 1000) * costPer1kChars;

		return {
			kind: "completed",
			ir: irResponse,
			upstream: new Response(JSON.stringify(irResponse), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			}),
			bill: {
				cost_cents: Math.ceil(costCents * 100) / 100, // Round to 2 decimals
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

