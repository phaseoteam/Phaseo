import type { Metadata } from "next";
import CacheOpsClient from "./CacheOpsClient";

export const metadata: Metadata = {
	title: "Internal Cache Ops",
	description:
		"Internal cache operations panel for revalidating model, provider, search, rankings, and landing data.",
	robots: {
		index: false,
		follow: false,
	},
};

export default function InternalCacheOpsPage() {
	return <CacheOpsClient />;
}
