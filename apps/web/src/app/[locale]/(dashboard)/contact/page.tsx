import { Suspense } from "react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { buildMetadata } from "@/lib/seo";
import {
	getSupportWaitParts,
	getSupportAvailability,
} from "@/lib/support/schedule";
import { ContactClient } from "@/components/contact/ContactClient";
import { fetchContactPersonalization } from "@/lib/fetchers/internal/fetchContactPersonalization";
import { getLocale, getTranslations } from "next-intl/server";
import type { PublicLocale } from "@/i18n/routing";

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale: locale as PublicLocale, namespace: "Site.contact" });
	return buildMetadata({
		title: t("title"),
		description: t("intro"),
		path: "/contact",
		keywords: ["Phaseo support", "contact Phaseo", "AI gateway support", "AI model database help"],
	});
}

function getTawkConfig() {
	return {
		tawkPropertyId:
			process.env.TAWK_PROPERTY_ID ?? process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID,
		tawkWidgetId:
			process.env.TAWK_WIDGET_ID ??
			process.env.NEXT_PUBLIC_TAWK_WIDGET_ID ??
			"default",
	};
}

async function ContactPersonalization() {
	await connection();

	const locale = await getLocale();
	const t = await getTranslations({
		locale: locale as PublicLocale,
		namespace: "Site.contact",
	});
	const { isOpen, minutesUntilNextWindow } = getSupportAvailability();
	const wait = getSupportWaitParts(minutesUntilNextWindow);
	const backOnlineLabel = wait
		? t(
				wait.unit === "minutes"
					? "resumeAfterMinutes"
					: "resumeAfterHours",
				{ count: wait.count },
			)
		: null;
	const statusLabel = isOpen
		? t("availableNow")
		: backOnlineLabel
			? t("backIn", { time: backOnlineLabel })
			: t("outsideHours");
	const statusTone = isOpen
		? "bg-emerald-500 ring-emerald-400/60"
		: "bg-amber-500 ring-amber-400/60";
	const waitText = isOpen
		? t("availableReplyNotice")
		: backOnlineLabel
			? t("supportBackInNotice", { time: backOnlineLabel })
			: t("supportAwayNotice");
	const personalization = await fetchContactPersonalization();
	const { tawkPropertyId, tawkWidgetId } = getTawkConfig();
	const londonTimeLabel = new Intl.DateTimeFormat(locale, {
		weekday: "short",
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		timeZone: "Europe/London",
	}).format(new Date());

	return (
		<ContactClient
			isOpen={isOpen}
			isAuthenticated={personalization.isAuthenticated}
			londonTimeLabel={londonTimeLabel}
			statusLabel={statusLabel}
			statusTone={statusTone}
			waitText={waitText}
			userEmail={personalization.userEmail}
			tierLabel={personalization.tierLabel}
			defaultInternalId={personalization.defaultInternalId}
			tawkPropertyId={tawkPropertyId}
			tawkWidgetId={tawkWidgetId}
		/>
	);
}

export default async function ContactPage() {
	const { tawkPropertyId, tawkWidgetId } = getTawkConfig();
	const t = await getTranslations("Site.contact");

	return (
		<Suspense
			fallback={
				<ContactClient
					isOpen={false}
					isAuthenticated={false}
					londonTimeLabel=""
					statusLabel={t("checking")}
					statusTone="bg-amber-500 ring-amber-400/60"
					waitText={t("loadingSupportHours")}
					userEmail={null}
					tierLabel=""
					defaultInternalId=""
					tawkPropertyId={tawkPropertyId}
					tawkWidgetId={tawkWidgetId}
				/>
			}
		>
			<ContactPersonalization />
		</Suspense>
	);
}
