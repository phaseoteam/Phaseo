import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { mcpConnectionsFlag } from "@/lib/flags";
import ConnectionsSettings from "@/components/(gateway)/settings/connections/ConnectionsSettings";

export async function generateMetadata() {
	const t = await getTranslations("SettingsUI");
	return { title: `${t("settingsPageMetadata.connections")} - ${t("headers.settings")}` };
}

export default async function ConnectionsPage() {
	if (!(await mcpConnectionsFlag().catch(() => false))) notFound();
	return <ConnectionsSettings />;
}
