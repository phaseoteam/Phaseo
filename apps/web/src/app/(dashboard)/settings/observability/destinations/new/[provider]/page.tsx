import { notFound } from "next/navigation";
import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import BroadcastDestinationContent from "./BroadcastDestinationContent";
import { getDestinationById } from "@/components/(gateway)/settings/observability/destinationCatalog";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ provider: string }>;
}) {
	const { provider } = await params;
	const destination = getDestinationById(provider);
	return {
		title: destination
			? `New ${destination.label} Destination - Broadcast`
			: "New Destination - Broadcast",
	};
}

export default async function NewBroadcastDestinationPage({
	params,
}: {
	params: Promise<{ provider: string }>;
}) {
	const { provider } = await params;
	const destination = getDestinationById(provider);
	if (!destination) notFound();

	return (
		<main className="space-y-6">
			<Suspense fallback={<SettingsSectionFallback />}>
				<BroadcastDestinationContent destination={destination} />
			</Suspense>
		</main>
	);
}
