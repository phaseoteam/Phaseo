"use client";
import { Suspense } from "react";
import { useTranslations } from "@/i18n/react";
import RoutingSettingsClient from "@/components/(gateway)/settings/routing/RoutingSettingsClient";
import ModelSuccessorRoutingSettings from "@/components/(gateway)/settings/routing/ModelSuccessorRoutingSettings";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { SettingsResourceQuery } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import type { SettingsRoutingInitialData } from "@/lib/fetchers/internal/settingsTypes";


export default function RoutingSettingsPage({ showModelSuccessor }: { showModelSuccessor: boolean }) {
	const t = useTranslations("SettingsUI");
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title={t("headers.routing")}
				description={t("headers.routingDescription")}
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<RoutingSettingsContent showModelSuccessor={showModelSuccessor} />
			</Suspense>
		</div>
	);
}

function RoutingSettingsContent({ showModelSuccessor }: { showModelSuccessor: boolean }) {
	return (
		<SettingsResourceQuery resource="routing">
			{(initialData) => <RoutingSettingsView initialData={initialData} showModelSuccessor={showModelSuccessor} />}
		</SettingsResourceQuery>
	);
}

function RoutingSettingsView({ initialData, showModelSuccessor }: { initialData: SettingsRoutingInitialData; showModelSuccessor: boolean }) {
	const t = useTranslations("SettingsUI");

	if (!initialData.workspaceId) {
		return (
			<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
				{t("settingsPageCopy.routingWorkspace")}
			</div>
		);
	}

	return (
		<div className="space-y-8">
			<RoutingSettingsClient
				initialMode={initialData.routingMode}
				initialBetaChannelEnabled={initialData.betaChannelEnabled}
				initialAlphaChannelEnabled={initialData.alphaChannelEnabled}
				initialResponseHealingEnabled={initialData.responseHealingEnabled}
				initialResponseHealingLocked={initialData.responseHealingLocked}
				initialResponseHealingMode={initialData.responseHealingMode}
				teamName={initialData.teamName}
			/>
			{showModelSuccessor ? <ModelSuccessorRoutingSettings /> : null}
		</div>
	);
}
