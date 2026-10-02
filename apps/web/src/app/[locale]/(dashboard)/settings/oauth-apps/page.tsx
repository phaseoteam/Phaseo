import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import { UserRoundX } from "lucide-react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import OAuthAppsContent from "./OAuthAppsContent";
import { isThirdPartyOAuthEnabled } from "@/lib/oauth/thirdPartyOAuth";
import { buildMetadata } from "@/lib/seo";
import type { PublicLocale } from "@/i18n/routing";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ locale: PublicLocale }>;
}): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({
		locale,
		namespace: "SettingsUI.oauthAppsPage",
	});

	return buildMetadata({
		title: t("metadataTitle"),
		description: t("metadataDescription"),
		path: "/settings/oauth-apps",
	});
}

export default async function OAuthAppsPage({
	params,
}: {
	params: Promise<{ locale: PublicLocale }>;
}) {
	const { locale } = await params;
	const t = await getTranslations({
		locale,
		namespace: "SettingsUI.oauthAppsPage",
	});
	const thirdPartyOAuthEnabled = isThirdPartyOAuthEnabled();

	if (!thirdPartyOAuthEnabled) {
		return (
			<div className="space-y-6">
				<SettingsPageHeader
					title={t("title")}
					meta={
						<span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-200">
							{t("comingSoonLabel")}
						</span>
					}
					description={t("comingSoonDescription")}
				/>
				<Empty className="rounded-xl border border-dashed border-border/80 p-8">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<UserRoundX className="h-5 w-5" />
						</EmptyMedia>
						<EmptyTitle>{t("comingSoonTitle")}</EmptyTitle>
						<EmptyDescription>
							{t("comingSoonBody")}
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950 p-4">
				<div className="flex items-start gap-3">
					<div className="flex-shrink-0">
						<span className="inline-flex items-center rounded-md bg-yellow-100 dark:bg-yellow-900 px-2 py-1 text-xs font-medium text-yellow-800 dark:text-yellow-200">
							{t("alphaLabel")}
						</span>
					</div>
					<div className="flex-1">
						<h3 className="text-sm font-semibold text-yellow-900 dark:text-yellow-100">
							{t("alphaTitle")}
						</h3>
						<p className="text-sm text-yellow-800 dark:text-yellow-200 mt-1">
							{t.rich("alphaNotice", {
								issueLink: (chunks) => (
									<a
										href="https://github.com/phaseoteam/Phaseo/issues/new/choose"
										target="_blank"
										rel="noopener noreferrer"
										className="underline hover:no-underline"
									>
										{chunks}
									</a>
								),
							})}
						</p>
						<ul className="text-xs text-yellow-700 dark:text-yellow-300 mt-2 space-y-1 list-disc list-inside">
							<li>{t("warningProduction")}</li>
							<li>{t("warningChanges")}</li>
							<li>{t("warningCritical")}</li>
						</ul>
					</div>
				</div>
			</div>

			<Suspense fallback={<SettingsSectionFallback />}>
				<OAuthAppsContent />
			</Suspense>
		</div>
	);
}
