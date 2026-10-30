"use client";

import { Badge } from "@/components/ui/badge";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import BetaSettingsClient from "@/components/(gateway)/settings/beta/BetaSettingsClient";
import {
	WEB_BETA_FEATURES,
	type WebBetaFeatureDefinition,
} from "@/lib/statsig/shared";
import { Link } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { getBetaMessages } from "@/i18n/beta";
import type { PublicLocale } from "@/i18n/routing";
import { getLocalizedDocsHref } from "@/lib/docs";
import { SettingsResourceQuery } from "@/components/(gateway)/settings/PrivateSettingsQuery";
import type { SettingsBetaInitialData } from "@/lib/fetchers/internal/settingsTypes";

type Availability = { videoEnabled: boolean; batchEnabled: boolean };

export default function BetaContent(props: Availability) {
	return <SettingsResourceQuery resource="beta" workspace={false}>{(initialData) => <BetaView {...props} initialData={initialData} />}</SettingsResourceQuery>;
}

function BetaView({ initialData, videoEnabled, batchEnabled }: Availability & { initialData: SettingsBetaInitialData }) {
	const locale = useLocale();
	const messages = getBetaMessages(locale as PublicLocale);
	const t = useTranslations("SettingsUI.betaAvailability");
	const betaFeatures: readonly WebBetaFeatureDefinition[] = WEB_BETA_FEATURES.filter(
		(feature) =>
			(feature as WebBetaFeatureDefinition).selfService !== false &&
			(!feature.adminOnly || initialData.isAdmin),
	);

	if (!initialData.signedIn) {
		return (
			<div className="space-y-6">
				<SettingsPageHeader
					title={messages.title}
					description={messages.description}
					meta={<Badge variant="outline">{messages.badge}</Badge>}
				/>
				<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
					{messages.notSignedIn}
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title={messages.title}
				description={messages.description}
				meta={<Badge variant="outline">{messages.badge}</Badge>}
			/>
			<div className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60">
				{[
					{ title: t("videoTitle"), enabled: videoEnabled, kind: "video", description: t("videoDescription") },
					{ title: t("batchTitle"), enabled: batchEnabled, kind: "batch", description: t("batchDescription") },
				].map((feature) => (
					<div key={feature.kind} className="space-y-2 px-4 py-4 sm:px-5">
						<div className="flex flex-wrap items-center gap-2">
							<h2 className="text-sm font-medium">{feature.title}</h2>
							<Badge variant="outline">{messages.badge}</Badge>
							<Badge variant="secondary">{feature.enabled ? t("available") : t("inviteOnly")}</Badge>
						</div>
						<p className="text-sm text-muted-foreground">{feature.description}</p>
						<p className="text-sm text-muted-foreground">{t("accessDescription")}</p>
						<div className="flex gap-4 text-sm">
							<a className="underline underline-offset-4" href={getLocalizedDocsHref(locale, "https://phaseo.app/docs/v1/guides/async-video-and-batch")}>{t("guide")}</a>
							{feature.enabled ? <Link className="underline underline-offset-4" href={`/settings/usage/logs/${feature.kind === "video" ? "videos" : "batches"}`}>{t("viewJobs")}</Link> : null}
						</div>
					</div>
				))}
			</div>
			{betaFeatures.length === 0 ? (
				<div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
					{t("empty")}
				</div>
			) : (
				<BetaSettingsClient
					initialProfile={initialData.profile}
					features={betaFeatures}
				/>
			)}
		</div>
	);
}
