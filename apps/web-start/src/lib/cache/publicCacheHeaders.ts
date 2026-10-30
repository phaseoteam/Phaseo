export const PUBLIC_CDN_CACHE_CONTROL =
	"public, max-age=0, s-maxage=86400, stale-while-revalidate=604800";

export const PUBLIC_LONG_CDN_CACHE_CONTROL =
	"public, max-age=0, s-maxage=31536000, stale-while-revalidate=604800, stale-if-error=604800";

export const PUBLIC_CATALOGUE_CDN_CACHE_TAG = "public-model-catalogue";

export const PUBLIC_CDN_CACHE_HEADERS = {
	"Cache-Control": PUBLIC_CDN_CACHE_CONTROL,
	"Vercel-Cache-Tag": PUBLIC_CATALOGUE_CDN_CACHE_TAG,
} as const;

export const PUBLIC_LONG_CDN_CACHE_HEADERS = {
	"Cache-Control": PUBLIC_LONG_CDN_CACHE_CONTROL,
	"Vercel-Cache-Tag": PUBLIC_CATALOGUE_CDN_CACHE_TAG,
} as const;
