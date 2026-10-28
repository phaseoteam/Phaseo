import { builtInLogoData } from "@phaseo/app-kit/logos";
import { PUBLIC_CDN_CACHE_CONTROL } from "@/lib/cache/publicCacheHeaders";

// Rendered once per deploy and served from the CDN: no function runs per request.
export const dynamic = "force-static";

/**
 * The logo data (each ID's files under /logos, display names and aliases) for the apps. The mobile app downloads it,
 * so logos added here show without an app update; the files themselves stay in public/logos.
 */
export function GET() {
	return Response.json(builtInLogoData, { headers: { "Cache-Control": PUBLIC_CDN_CACHE_CONTROL } });
}
