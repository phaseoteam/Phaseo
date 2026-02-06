import { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
	return {
		rules: [
			{
				userAgent: "*",
				allow: "/",
				disallow: [
					"/api/",
					"/auth/",
					"/oauth/",
					"/sign-in",
					"/sign-up",
					"/settings/",
					"/internal/",
					"/gateway/usage",
					"/models/table",
					"/tools/latency-comparison",
					"/apps/",
					"/_next/",
				],
			},
		],
		sitemap: `${SITE_URL}/sitemap.xml`,
		host: SITE_URL,
	};
}
