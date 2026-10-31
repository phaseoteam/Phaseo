import { useSuspenseQuery } from "@tanstack/react-query";
import { useTranslations } from "@/i18n/react";
import { getTranslations } from "@/i18n/server";
import { KeyIncidents } from "@/app/(dashboard)/internal/key-incidents/KeyIncidents";
import { keyIncidentsQuery } from "../internalAdmin.functions";

export async function generateMetadata() { const t = await getTranslations("SettingsUI"); return { title: t("keyIncidents.title"), robots: { index: false, follow: false } }; }

// The admin gate (requireInternalAdmin) runs in the route's beforeLoad; the
// server function re-checks it before returning incidents.
export default function KeyIncidentsPage() {
	const t = useTranslations("SettingsUI");
	const { data } = useSuspenseQuery(keyIncidentsQuery());
	return <main className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
		<header className="space-y-2">
			<h1 className="text-2xl font-semibold">{t("keyIncidents.title")}</h1>
			<p className="text-sm text-muted-foreground">{t("keyIncidents.description")}</p>
		</header>
		<KeyIncidents incidents={data.incidents} />
	</main>;
}
