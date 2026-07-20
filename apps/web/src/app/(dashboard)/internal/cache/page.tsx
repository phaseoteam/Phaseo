import type { Metadata } from "next";
import CacheOpsClient from "./CacheOpsClient";

export const metadata: Metadata = {
	title: "Cache Control Centre",
	description:
		"Admin controls for targeted Cloudflare Worker cache eviction and browser search generations.",
	robots: {
		index: false,
		follow: false,
	},
};

export default function InternalCacheOpsPage() {
	return <CacheOpsClient />;
}
