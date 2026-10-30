import { use } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@/i18n/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { SlackAgentInstallations } from "@/app/(dashboard)/internal/slack-agent/SlackAgentInstallations";
import { slackAgentInstallationsQuery } from "../internalAdmin.functions";

export async function generateMetadata() { const t = await getTranslations("SettingsUI"); return { title: t("slackAgentInstallations.title"), robots: { index: false, follow: false } }; }

// The admin gate (requireInternalAdmin) runs in the route's beforeLoad; the
// server function re-checks it before returning installations.
export default function SlackAgentInstallationsRoute({ searchParams }: { searchParams: Promise<{ offset?: string }> }) {
	const t = useTranslations("SettingsUI");
	const params = use(searchParams);
	const format = useFormatter();
	const offset = Math.min(100_000, Math.max(0, Math.floor(Number(params.offset) || 0)));
	const { data } = useSuspenseQuery(slackAgentInstallationsQuery(offset));
	const month = format.dateTime(new Date(`${data.period_start}T00:00:00Z`), { month: "long", year: "numeric", timeZone: "UTC" });
	return <main className="container mx-auto space-y-6 px-4 py-8">
		<header className="space-y-2">
			<h1 className="text-2xl font-semibold">{t("slackAgentInstallations.title")}</h1>
			<p className="text-sm text-muted-foreground">{t("slackAgentInstallations.description", { month })}</p>
			<p className="text-xs text-muted-foreground">{t("slackAgentInstallations.notes")}</p>
		</header>
		<SlackAgentInstallations installations={data.installations} />
		<nav aria-label={t("slackAgentInstallations.pages")} className="flex gap-4 text-sm">
			<span>{t("slackAgentInstallations.count", { count: data.total })}</span>
			{offset > 0 && <Link href={`?offset=${Math.max(0, offset - data.page_size)}`}>{t("slackAgentInstallations.previous")}</Link>}
			{offset + data.page_size < data.total && <Link href={`?offset=${offset + data.page_size}`}>{t("slackAgentInstallations.next")}</Link>}
		</nav>
	</main>;
}
