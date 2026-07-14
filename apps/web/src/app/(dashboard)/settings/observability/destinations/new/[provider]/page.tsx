import { notFound } from "next/navigation";
import BroadcastDestinationCreateClient from "@/components/(gateway)/settings/observability/BroadcastDestinationCreateClient";
import { getDestinationById } from "@/components/(gateway)/settings/observability/destinationCatalog";
import { fetchSettingsObservabilityDestinationNewInitialData } from "@/lib/fetchers/internal/fetchSettingsObservabilityDestinationNewInitialData";

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

	const initialData =
		await fetchSettingsObservabilityDestinationNewInitialData(provider);
	if (!initialData.destinationFound) notFound();

	if (!initialData.workspaceId) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				Select a workspace to add a destination.
			</div>
		);
	}

	return (
		<main className="space-y-6">
			<BroadcastDestinationCreateClient
				destination={destination}
				teamName={initialData.teamName}
				providerOptions={initialData.providerOptions}
				modelOptions={initialData.modelOptions}
				keys={initialData.keys}
			/>
		</main>
	);
}
