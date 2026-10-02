"use client";

import React from "react";
import OAuthAppCard from "./OAuthAppCard";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { AppWindow } from "lucide-react";
import { useTranslations } from "next-intl";

interface OAuthAppsPanelProps {
	oauthApps: any[];
}

export default function OAuthAppsPanel({
	oauthApps,
}: OAuthAppsPanelProps) {
	const t = useTranslations("SettingsUI");
	if (!oauthApps || oauthApps.length === 0) {
		return (
			<Empty className="rounded-xl border border-dashed border-border/80 p-8">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<AppWindow className="h-5 w-5" />
					</EmptyMedia>
					<EmptyTitle>{t("strings.No OAuth apps yet" as never)}</EmptyTitle>
					<EmptyDescription>
						{t("strings.phraseCreateYourFirstOAuthAppToEnableThirdPartyIntegrationsWithYourPhaseoAccount" as never)}
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
			{oauthApps.map((app) => (
				<OAuthAppCard
					key={app.id}
					app={app}
				/>
			))}
		</div>
	);
}
