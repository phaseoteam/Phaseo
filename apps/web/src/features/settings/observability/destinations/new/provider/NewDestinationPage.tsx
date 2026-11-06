import { useTranslations } from "@/i18n/react";
import { notFound } from "@/lib/navigation";
import { Suspense } from "react";
import { useParams } from "@tanstack/react-router";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import BroadcastDestinationContent from "./BroadcastDestinationContent";
import { getDestinationById } from "@/components/(gateway)/settings/observability/destinationCatalog";
import { getTranslations } from "@/i18n/server";
import type { RouteMetadataInput } from "@/lib/start/metadata";

export async function getNewDestinationMetadata({ params }: RouteMetadataInput) {
	const destination = getDestinationById(params.provider);
	const t = await getTranslations("SettingsUI");
	return {
		title: destination
			? t("settingsPageCopy.newDestinationTitle", { destination: destination.label })
			: t("settingsPageCopy.newDestinationFallbackTitle"),
	};
}

export default function NewBroadcastDestinationPage() {
	const { provider } = useParams({ from: "/{-$locale}/_dashboard/settings/observability/destinations/new/$provider/" });
	const destination = getDestinationById(provider);
	const t = useTranslations("SettingsUI");
	if (!destination) notFound();

	return (
		<main className="space-y-6">
			<Suspense fallback={<SettingsSectionFallback />}>
				<BroadcastDestinationContent destination={destination} />
			</Suspense>
		</main>
	);
}
