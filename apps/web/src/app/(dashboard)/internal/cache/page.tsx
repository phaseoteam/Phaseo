import type { Metadata } from "next";
import CacheOpsClient from "./CacheOpsClient";

export const metadata: Metadata = {
	title: "Cache Control Centre",
	description:
		"Admin controls for targeted Cloudflare Worker and website cache eviction.",
	robots: {
		index: false,
		follow: false,
	},
};

export default function InternalCacheOpsPage() {
	return <CacheOpsClient />;
}
