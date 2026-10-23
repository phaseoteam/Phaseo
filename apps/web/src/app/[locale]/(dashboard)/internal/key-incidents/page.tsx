import { getTranslations } from "next-intl/server";
import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchInternalWebApi } from "@/lib/web-api/client";
import { KeyIncidents } from "@/app/(dashboard)/internal/key-incidents/KeyIncidents";
import type { KeyIncident } from "@/app/(dashboard)/internal/key-incidents/types";

export async function generateMetadata() { const t = await getTranslations("SettingsUI"); return { title: t("keyIncidents.title"), robots: { index: false, follow: false } }; }

export default async function KeyIncidentsPage() {
	const t = await getTranslations("SettingsUI");
	await requireInternalAdmin();
	const { accessToken } = await getServerAccountContext();
	const data = await fetchInternalWebApi<{ incidents: KeyIncident[] }>("/api/internal/key-incidents/list", accessToken);
	return <main className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
		<header className="space-y-2">
			<h1 className="text-2xl font-semibold">{t("keyIncidents.title")}</h1>
			<p className="text-sm text-muted-foreground">{t("keyIncidents.description")}</p>
		</header>
		<KeyIncidents incidents={data.incidents} />
	</main>;
}
