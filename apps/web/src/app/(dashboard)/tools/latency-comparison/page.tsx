import { redirect } from "next/navigation";
import type { Metadata } from "next";
import LatencyComparisonClient from "./LatencyComparisonClient";
import { fetchInternalAuthStatus } from "@/lib/fetchers/internal/fetchInternalAuthStatus";

export const metadata: Metadata = {
	title: "Latency Comparison - Compare Gateway vs OpenAI Response Times",
	description:
		"Compare response times between your gateway and OpenAI API with real-time streaming metrics.",
	robots: {
		index: false,
		follow: false,
	},
};

export default async function LatencyComparisonPage() {
	const authStatus = await fetchInternalAuthStatus();
	if (!authStatus.signedIn) {
		redirect("/sign-in");
	}

	if (!authStatus.isAdmin) {
		redirect("/");
	}

	return <LatencyComparisonClient />;
}
