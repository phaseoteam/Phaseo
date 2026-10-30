import { notFound } from "next/navigation";
import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import BroadcastDestinationContent from "./BroadcastDestinationContent";
import { getDestinationById } from "@/components/(gateway)/settings/observability/destinationCatalog";
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

	return (
		<main className="space-y-6">
			<Suspense fallback={<SettingsSectionFallback />}>
				<BroadcastDestinationContent destination={destination} />
			</Suspense>
		</main>
	);
}
