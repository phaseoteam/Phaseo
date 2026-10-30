"use client";

import { useTranslations } from "next-intl";
import { notFound } from "next/navigation";
import BroadcastDestinationCreateClient from "@/components/(gateway)/settings/observability/BroadcastDestinationCreateClient";
import { PrivateSettingsQuery } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import type { DestinationDefinition } from "@/components/(gateway)/settings/observability/destinationCatalog";
import type { SettingsObservabilityDestinationNewInitialData } from "@/lib/fetchers/internal/settingsTypes";

export default function BroadcastDestinationContent({ destination }: { destination: DestinationDefinition }) {
	const t = useTranslations("SettingsUI.settingsPageCopy");
	return <PrivateSettingsQuery<SettingsObservabilityDestinationNewInitialData>
		path={`/api/account/settings/observability/destinations/new/${destination.id}`}
		resource="broadcast-form" parameters={destination.id}
	>{(data) => {
		if (!data.destinationFound) notFound();
		if (!data.workspaceId) return <p>{t("destinationWorkspace")}</p>;
		return <BroadcastDestinationCreateClient key={destination.id} destination={destination}
			teamName={data.teamName} workspaceId={data.workspaceId}
			providerOptions={data.providerOptions} modelOptions={data.modelOptions} keys={data.keys} />;
	}}</PrivateSettingsQuery>;
}
