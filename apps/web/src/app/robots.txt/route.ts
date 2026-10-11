import { publicLocales } from "@/i18n/routing";
import { CONTENT_SIGNAL_VALUE } from "@/lib/agent-discovery";
import { PUBLIC_CDN_CACHE_CONTROL } from "@/lib/cache/publicCacheHeaders";
import { SITE_URL } from "@/lib/seo";

const PAGE_DISALLOW_PATHS = [
	"/sign-in",
	"/sign-up",
	"/settings/",
	"/internal/",
	"/gateway/usage",
] as const;

// Pages are also served under every locale prefix, such as /de-DE/sign-up.
// Route handlers are not localized.
const DISALLOW_PATHS = [
	"/api/",
	"/auth/",
	...PAGE_DISALLOW_PATHS,
	...publicLocales.flatMap((locale) =>
		PAGE_DISALLOW_PATHS.map((path) => `/${locale}${path}`),
	),
];

// Crawlers kept out of the whole site. Reflectionbot sent about a quarter of
// all requests in October 2026, mostly to localized copies of catalogue pages.
const BLOCKED_USER_AGENTS = ["Reflectionbot"] as const;

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
	...BLOCKED_USER_AGENTS.flatMap((userAgent) => [
		`User-agent: ${userAgent}`,
		"Disallow: /",
		"",
	]),
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
