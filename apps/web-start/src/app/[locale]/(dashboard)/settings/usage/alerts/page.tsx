import { getPrivateUsageScope } from "@/lib/fetchers/internal/getPrivateUsageScope";
import UsageAlertsClient from "./UsageAlertsClient";
import { getTranslations } from "next-intl/server";
export async function generateMetadata() { const t = await getTranslations("SettingsUI.settingsPageMetadata"); return { title: t("lifecycleAlerts") }; }
export default async function Page() { return <UsageAlertsClient scope={await getPrivateUsageScope()} />; }
