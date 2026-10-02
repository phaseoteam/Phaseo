import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import { requireInternalAdmin } from "@/lib/auth/requireInternalAdmin";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchInternalWebApi } from "@/lib/web-api/client";
import { BillingReviews } from "@/app/(dashboard)/internal/realtime-billing/BillingReviews";
import type { Review } from "@/app/(dashboard)/internal/realtime-billing/types";

export async function generateMetadata() { const t = await getTranslations("SettingsUI"); return { title: t("realtimeCopy.billingReview"), robots: { index: false, follow: false } }; }

export default async function RealtimeBillingPage({ searchParams }: { searchParams: Promise<{ state?: string; offset?: string }> }) {
	const t = await getTranslations("SettingsUI");
	await requireInternalAdmin();
	const [{ accessToken }, params] = await Promise.all([getServerAccountContext(), searchParams]);
	const state = params.state === "resolved" ? "resolved" : "open";
	const offset = Math.min(10000, Math.max(0, Math.floor(Number(params.offset) || 0)));
	const data = await fetchInternalWebApi<{ reviews: Review[]; total: number }>(
		`/api/internal/realtime-billing/reviews?state=${state}&offset=${offset}`, accessToken);
	return <main className="container mx-auto space-y-6 px-4 py-8">
		<header className="space-y-2"><h1 className="text-2xl font-semibold">{t("realtimeCopy.billingReview")}</h1>
			<p className="text-sm text-muted-foreground">{t("realtimeCopy.billingReviewHelp")}</p></header>
		<nav aria-label={t("realtimeCopy.reviewStatus")} className="flex gap-4 text-sm">
			<Link href="?state=open" aria-current={state === "open" ? "page" : undefined} className={state === "open" ? "font-semibold underline" : "text-muted-foreground"}>{t("realtimeCopy.copyOpen")}</Link>
			<Link href="?state=resolved" aria-current={state === "resolved" ? "page" : undefined} className={state === "resolved" ? "font-semibold underline" : "text-muted-foreground"}>{t("realtimeCopy.resolved")}</Link>
		</nav>
		<BillingReviews reviews={data.reviews} />
		<nav aria-label={t("realtimeCopy.reviewPages")} className="flex gap-4 text-sm"><span>{t("realtimeCopy.reviewCount", { count: data.total })}</span>
			{offset > 0 && <Link href={`?state=${state}&offset=${Math.max(0, offset - 50)}`}>{t("realtimeCopy.copyPrevious")}</Link>}
			{offset + 50 < data.total && <Link href={`?state=${state}&offset=${offset + 50}`}>{t("realtimeCopy.copyNext")}</Link>}
		</nav>
	</main>;
}
