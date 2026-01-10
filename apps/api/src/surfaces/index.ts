// Surface registry
// Maps surface IDs to surface implementations

import type { Surface, SurfaceId } from "./types";
import { openaiCompatSurface } from "./openai-compat";
import { anthropicSurface } from "./anthropic";

/**
 * Surface registry
 * All available surfaces for executing requests
 */
export const SURFACES: Record<SurfaceId, Surface> = {
	openai_compat: openaiCompatSurface,
	anthropic: anthropicSurface,
};

/**
 * Get a surface by ID
 * @param surfaceId - Surface identifier
 * @returns Surface implementation
 * @throws Error if surface not found
 */
export function getSurface(surfaceId: SurfaceId): Surface {
	const surface = SURFACES[surfaceId];
	if (!surface) {
		throw new Error(`Surface not found: ${surfaceId}`);
	}
	return surface;
}

/**
 * Get surface ID for a provider
 * Simple V1 mapping: Anthropic → anthropic, everyone else → openai_compat
 *
 * TODO: Move this to database lookup (data_api_provider_model_surfaces table)
 *
 * @param providerId - Provider identifier (e.g., "openai", "anthropic", "groq")
 * @returns Surface ID to use for this provider
 */
export function getSurfaceIdForProvider(providerId: string): SurfaceId {
	if (providerId === "anthropic") {
		return "anthropic";
	}

	// Everyone else uses OpenAI-compatible surface
	// This includes: openai, groq, deepseek, together, fireworks, mistral, etc.
	return "openai_compat";
}
