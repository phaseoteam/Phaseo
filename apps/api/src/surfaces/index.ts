// Surface registry
// Maps surface IDs to surface implementations

import type { Surface, SurfaceId } from "./types";
import type { Endpoint } from "@core/types";
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

const SURFACE_BY_PROVIDER: Record<string, SurfaceId> = {
    anthropic: "anthropic",
};

const SURFACE_BY_PROVIDER_ENDPOINT: Record<string, SurfaceId> = {
    // "provider:endpoint": "surfaceId"
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
        return SURFACE_BY_PROVIDER[providerId] ?? "openai_compat";
}

export function getSurfaceIdForProviderAndEndpoint(
        providerId: string,
        endpoint: Endpoint
): SurfaceId {
        const key = `${providerId}:${endpoint}`;
        return SURFACE_BY_PROVIDER_ENDPOINT[key] ?? getSurfaceIdForProvider(providerId);
}

