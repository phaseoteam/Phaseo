import { useSuspenseQuery } from "@tanstack/react-query";
import { privateUsageScopeQuery } from "../usage.functions";
import UsageAlertsClient from "./UsageAlertsClient";
import { getTranslations } from "next-intl/server";
export async function generateMetadata() { const t = await getTranslations("SettingsUI.settingsPageMetadata"); return { title: t("lifecycleAlerts") }; }
export default function Page() { const { data: scope } = useSuspenseQuery(privateUsageScopeQuery()); return <UsageAlertsClient scope={scope} />; }
