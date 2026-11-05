import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("settingsPageMetadata.rateLimits")} - ${t("headers.settings")}` };
}

/** Rate limits are rate guardrails now, set up and assigned under Settings, Guardrails. */
export default function RateLimitsPage() {
	redirect("/settings/guardrails");
}
