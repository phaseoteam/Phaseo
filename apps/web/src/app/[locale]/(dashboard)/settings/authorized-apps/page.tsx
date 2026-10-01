import { getLocale, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import AuthorizedAppsPanel from "@/components/(gateway)/settings/authorized-apps/AuthorizedAppsPanel";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { fetchSettingsAuthorizedAppsInitialData } from "@/lib/fetchers/internal/fetchSettingsAuthorizedAppsInitialData";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.oauthIntegrations")} - ${t("headers.settings")}`, description: t("settingsRouteCopy.oauthIntegrationsDescription") };
}

export default async function AuthorizedAppsPage() {
	const [t, locale] = await Promise.all([
		getTranslations("SettingsUI"),
		getLocale(),
	]);
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="OAuth Integrations"
				titleKey="headers.oauthIntegrations"
				meta={
					<span className="inline-flex items-center rounded-md bg-yellow-100 dark:bg-yellow-900 px-2 py-1 text-xs font-medium text-yellow-800 dark:text-yellow-200">
						{t("oauthAppsPage.alphaLabel")}
					</span>
				}
				description="Manage third-party applications that have access to your Phaseo account. You can revoke access at any time."
				descriptionKey="settingsRouteCopy.oauthIntegrationsDescription"
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<AuthorizedAppsContent locale={locale} />
			</Suspense>
		</div>
	);
}

async function AuthorizedAppsContent({ locale }: { locale: string }) {
	const initialData = await fetchSettingsAuthorizedAppsInitialData(locale);

	if (!initialData.signedIn || !initialData.userId) {
		redirect("/sign-in");
	}

	return (
		<AuthorizedAppsPanel
			authorizedApps={initialData.authorizedApps}
			userId={initialData.userId}
		/>
	);
}
