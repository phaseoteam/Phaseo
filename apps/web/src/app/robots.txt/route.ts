import { CONTENT_SIGNAL_VALUE } from "@/lib/agent-discovery";
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
			"Cache-Control": "public, max-age=3600, stale-while-revalidate=3600",
			"Content-Signal": CONTENT_SIGNAL_VALUE,
			"Content-Type": "text/plain; charset=utf-8",
		},
	});
}
