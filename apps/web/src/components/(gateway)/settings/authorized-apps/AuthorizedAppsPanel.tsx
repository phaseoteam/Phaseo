"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import AuthorizationCard from "./AuthorizationCard";

interface AuthorizedAppsPanelProps {
	authorizedApps: any[];
	userId: string;
}

export default function AuthorizedAppsPanel({
	authorizedApps,
	userId,
}: AuthorizedAppsPanelProps) {
	const t = useTranslations("SettingsUI");
	if (!authorizedApps || authorizedApps.length === 0) {
		return (
			<Card className="p-8 text-center">
				<div className="text-muted-foreground">
					<p className="text-lg font-medium mb-2">{t("strings.No authorized apps" as never)}</p>
					<p className="text-sm">
						{t("strings.phraseYouHavenAposTAuthorizedAnyThirdPartyApplicationsYetWhenYouDoTheyAposLlAppearHere" as never)}
					</p>
				</div>
			</Card>
		);
	}

	return (
		<div className="space-y-4">
			{authorizedApps.map((auth) => (
				<AuthorizationCard
					key={auth.authorization_id}
					authorization={auth}
					userId={userId}
				/>
			))}
		</div>
	);
}
