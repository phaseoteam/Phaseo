import { CONTENT_SIGNAL_VALUE } from "@/lib/agent-discovery";
import { PUBLIC_CDN_CACHE_CONTROL } from "@/lib/cache/publicCacheHeaders";
import { SITE_URL } from "@/lib/seo";

const DISALLOW_PATHS = [
	"/api/",
	"/auth/",
	"/sign-in",
	"/sign-up",
	"/settings/",
	"/internal/",
	"/gateway/usage",
] as const;

function buildRobotBlock(userAgent: string): string[] {
	return [
		`User-agent: ${userAgent}`,
		`Content-Signal: ${CONTENT_SIGNAL_VALUE}`,
		"Allow: /",
		...DISALLOW_PATHS.map((path) => `Disallow: ${path}`),
		"",
	];
}

const ROBOTS_BODY = [
	...buildRobotBlock("*"),
	...buildRobotBlock("OAI-SearchBot"),
	...buildRobotBlock("ChatGPT-User"),
	...buildRobotBlock("GPTBot"),
	`Sitemap: ${SITE_URL}/sitemap.xml`,
	`Sitemap: ${SITE_URL}/docs/sitemap.xml`,
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
