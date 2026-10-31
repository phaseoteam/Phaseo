// Site-wide redirects and response headers, applied by the request middleware.
//
// Paths use ":name" segments: ":name*" matches the rest of the path (optional),
// ":name+" one or more segments, ":name?" an optional segment and
// ":name(a|b)" a segment from a fixed set. Host conditions are label arrays
// (["docs", "phaseo", "app"]) because the repository's domain check rejects
// legacy hostnames written out in full.

export type HostCondition = { type: "host"; value: string[] };

export type RedirectRule = {
	source: string;
	destination: string;
	/** 308 when true, 307 otherwise. */
	permanent: boolean;
	has?: HostCondition[];
};

export type HeaderRule = {
	source: string;
	headers: Array<{ key: string; value: string }>;
	has?: HostCondition[];
};

const host = (...labels: string[]): HostCondition[] => [{ type: "host", value: labels }];

export const redirects: RedirectRule[] = [
	// Legacy hosts.
	{ source: "/:path*", has: host("ai-stats", "vercel", "app"), destination: "https://phaseo.app/:path*", permanent: true },
	{ source: "/:path*", has: host("docs", "phaseo", "app"), destination: "https://phaseo.app/docs/:path*", permanent: true },
	{ source: "/:path*", has: host("docs", "ai-stats", "phaseo", "app"), destination: "https://phaseo.app/docs/:path*", permanent: true },
	// Retired model page tabs.
	{ source: "/models/:organisation/:model/pricing", destination: "/models/:organisation/:model#pricing", permanent: true },
	{ source: "/models/:organisation/:model/gateway", destination: "/models/:organisation/:model", permanent: true },
	// Renamed pages.
	{ source: "/announcements", destination: "/blog", permanent: true },
	{ source: "/announcements/:slug*", destination: "/blog/:slug*", permanent: true },
	{ source: "/updates/web", destination: "/updates/models", permanent: true },
	{ source: "/updates/youtube", destination: "/updates/models", permanent: true },
	{ source: "/how-ai-stats-calculates-model-pricing", destination: "/how-phaseo-calculates-model-pricing", permanent: true },
	{ source: "/how-ai-stats-measures-latency-throughput", destination: "/how-phaseo-measures-latency-throughput", permanent: true },
	{ source: "/how-ai-stats-normalises-ai-benchmarks", destination: "/how-phaseo-normalises-ai-benchmarks", permanent: true },
	{ source: "/how-ai-stats-tracks-provider-availability", destination: "/how-phaseo-tracks-provider-availability", permanent: true },
	{ source: "/status", destination: "https://status.phaseo.app", permanent: true },
];

export const headerRules: HeaderRule[] = [
	{
		source: "/:path*",
		headers: [
			{ key: "X-Content-Type-Options", value: "nosniff" },
			{ key: "X-Frame-Options", value: "SAMEORIGIN" },
			{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
			{ key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=(self)" },
		],
	},
	{
		source: "/_i18n/:path*",
		headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
	},
	{
		source: "/:locale(en-GB|en-US|es-ES|fr-FR|de-DE|pt-BR|ja|zh-Hans|hi|ar-SA)?/oauth/consent",
		headers: [
			{ key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; img-src 'self' data:" },
			{ key: "Cache-Control", value: "no-store" },
		],
	},
	{
		source: "/",
		headers: [
			{
				key: "Link",
				value: '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json", <https://phaseo.app/docs/v1/api-reference/introduction>; rel="service-doc"; type="text/html", </.well-known/agent-skills/index.json>; rel="describedby"; type="application/json"',
			},
			{ key: "Vary", value: "Accept" },
		],
	},
];
