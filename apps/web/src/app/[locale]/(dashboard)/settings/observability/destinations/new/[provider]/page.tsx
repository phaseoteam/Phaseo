import { notFound } from "next/navigation";
import BroadcastDestinationCreateClient from "@/components/(gateway)/settings/observability/BroadcastDestinationCreateClient";
import { getDestinationById } from "@/components/(gateway)/settings/observability/destinationCatalog";
import { fetchSettingsObservabilityDestinationNewInitialData } from "@/lib/fetchers/internal/fetchSettingsObservabilityDestinationNewInitialData";
import { getTranslations } from "next-intl/server";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ provider: string }>;
}) {
	const { provider } = await params;
	const destination = getDestinationById(provider);
	const t = await getTranslations("SettingsUI");
	return {
		title: destination
			? t("settingsPageCopy.newDestinationTitle", { destination: destination.label })
			: t("settingsPageCopy.newDestinationFallbackTitle"),
	};
}

export default async function NewBroadcastDestinationPage({
	params,
}: {
	params: Promise<{ provider: string }>;
}) {
	const { provider } = await params;
	const destination = getDestinationById(provider);
	const t = await getTranslations("SettingsUI");
	if (!destination) notFound();

	const initialData =
		await fetchSettingsObservabilityDestinationNewInitialData(provider);
	if (!initialData.destinationFound) notFound();

	if (!initialData.workspaceId) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				{t("settingsPageCopy.destinationWorkspace")}
			</div>
		);
	}

	return (
		<main className="space-y-6">
			<BroadcastDestinationCreateClient
				destination={destination}
				teamName={initialData.teamName}
				workspaceId={initialData.workspaceId}
				providerOptions={initialData.providerOptions}
				modelOptions={initialData.modelOptions}
				keys={initialData.keys}
			/>
		</main>
	);
}
