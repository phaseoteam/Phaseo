import { getLocale, getTranslations } from "next-intl/server";
import AppsSettingsContent from "./AppsSettingsContent";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowUpRight } from "lucide-react";
import { Suspense } from "react";
import SettingsSectionFallback from "@/components/(gateway)/settings/SettingsSectionFallback";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import { getLocalizedDocsHref } from "@/lib/docs";

const ATTRIBUTION_DOCS_HREF =
	"https://phaseo.app/docs/v1/guides/app-attribution";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("headers.apps")} - ${t("headers.settings")}` };
}

export default async function AppsSettingsPage() {
	const [t, locale] = await Promise.all([
		getTranslations("SettingsUI.settingsRouteCopy"),
		getLocale(),
	]);
	return (
		<div className="space-y-6">
			<SettingsPageHeader
				title="Apps"
				titleKey="headers.apps"
				description="Manage application metadata and public visibility for your workspace."
				descriptionKey="headers.appsDescription"
				actions={
					<Button
						asChild
						variant="outline"
						size="sm"
						className="h-10 rounded-md"
					>
						<Link
							href={getLocalizedDocsHref(locale, ATTRIBUTION_DOCS_HREF)}
							target="_blank"
							rel="noreferrer"
						>
							{t("requestAttributionDocs")}
							<ArrowUpRight className="ml-1 h-4 w-4" />
						</Link>
					</Button>
				}
			/>
			<Suspense fallback={<SettingsSectionFallback />}>
				<AppsSettingsContent />
			</Suspense>
		</div>
	);
}
