import { Badge } from "@/components/ui/badge";
import { useLocale, useTranslations } from "@/i18n/react";
import { getLocalizedDocsHref } from "@/lib/docs";

export const FEATURE_MATURITY_DOCS_URL = "https://phaseo.app/docs/v1/developers/feature-maturity";

/** A settings page's stage badge, linking to the docs page that explains each stage. */
export function FeatureStageBadge({ stage }: { stage: "alpha" | "beta" }) {
	const locale = useLocale();
	const t = useTranslations("SettingsUI");
	const label = stage === "alpha" ? t("oauthAppsPage.alphaLabel") : t("settingsPageCopy.beta");
	return (
		<Badge
			variant="outline"
			render={<a href={getLocalizedDocsHref(locale, FEATURE_MATURITY_DOCS_URL)} target="_blank" rel="noreferrer" />}
		>
			{label}
		</Badge>
	);
}
