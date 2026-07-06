import { MonitorHistoryClient } from "@/components/monitor/MonitorHistoryClient";
import { fetchFrontendMonitorHistoryInitialData } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import type { Metadata } from "next";

export const metadata: Metadata = {
	title: "Monitor",
	description:
		"Track model availability, pricing updates, benchmark changes, and description edits on Phaseo in a compact monitor feed.",
	keywords: [
		"AI model changes",
		"AI updates",
		"AI pricing changes",
		"Phaseo monitor",
		"Phaseo",
	],
	alternates: {
		canonical: "/monitor",
	},
};

async function MonitorHistorySection() {
	const initialData = await fetchFrontendMonitorHistoryInitialData();

	return (
		<MonitorHistoryClient
			initialPage={initialData.initialPage}
			modelOptions={initialData.modelOptions}
			providerOptions={initialData.providerOptions}
		/>
	);
}

export default function MonitorPage() {
	return (
		<div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
			<MonitorHistorySection />
		</div>
	);
}
