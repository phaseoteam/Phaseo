import { CONTENT_SIGNAL_VALUE } from "@/lib/agent-discovery";
import { PUBLIC_CDN_CACHE_CONTROL } from "@/lib/cache/publicCacheHeaders";
import { SITE_URL } from "@/lib/seo";

const ROBOTS_BODY = [
	"User-agent: *",
	`Content-Signal: ${CONTENT_SIGNAL_VALUE}`,
	"Allow: /",
	"Disallow: /api/",
	"Disallow: /auth/",
	"Disallow: /sign-in",
	"Disallow: /sign-up",
	"Disallow: /settings/",
	"Disallow: /internal/",
	"Disallow: /gateway/usage",
	"",
	`Sitemap: ${SITE_URL}/sitemap.xml`,
	`Host: ${SITE_URL}`,
	"",
].join("\n");

export async function GET() {
	return new Response(ROBOTS_BODY, {
		status: 200,
		headers: {
			"Cache-Control": PUBLIC_CDN_CACHE_CONTROL,
			"Content-Signal": CONTENT_SIGNAL_VALUE,
			"Content-Type": "text/plain; charset=utf-8",
		},
	});
}
