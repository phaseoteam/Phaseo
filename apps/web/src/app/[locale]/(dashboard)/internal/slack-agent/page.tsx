import { Link } from "@/i18n/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchInternalWebApi } from "@/lib/web-api/client";
import { SlackAgentInstallations } from "@/app/(dashboard)/internal/slack-agent/SlackAgentInstallations";
import type { SlackAgentInstallationsPage } from "@/app/(dashboard)/internal/slack-agent/types";

export async function generateMetadata() { const t = await getTranslations("SettingsUI"); return { title: t("slackAgentInstallations.title"), robots: { index: false, follow: false } }; }

export default async function SlackAgentInstallationsRoute({ searchParams }: { searchParams: Promise<{ offset?: string }> }) {
	const t = await getTranslations("SettingsUI");
	await requireInternalAdmin();
	const [{ accessToken }, params, format] = await Promise.all([getServerAccountContext(), searchParams, getFormatter()]);
	const offset = Math.min(100_000, Math.max(0, Math.floor(Number(params.offset) || 0)));
	const data = await fetchInternalWebApi<SlackAgentInstallationsPage>(`/api/internal/slack-agent/installations?offset=${offset}`, accessToken);
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
