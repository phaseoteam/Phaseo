import { builtInLogoData } from "@phaseo/app-kit/logos";
import { PUBLIC_CDN_CACHE_CONTROL } from "@/lib/cache/publicCacheHeaders";

/**
 * The logo data (each ID's files under /logos, display names and aliases) for the apps. The mobile app downloads it,
 * so logos added here show without an app update; the files themselves stay in public/logos.
 * It reads no request data, so the CDN serves it like robots.txt.
 */
export function logoManifestResponse(): Response {
	return Response.json(builtInLogoData, { headers: { "Cache-Control": PUBLIC_CDN_CACHE_CONTROL } });
}
