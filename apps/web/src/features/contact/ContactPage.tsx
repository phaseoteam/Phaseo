import { Suspense } from "react";
import type { PageMetadata } from "@/lib/seo/metadataTypes";
import type { RouteMetadataInput } from "@/lib/start/metadata";
import { buildMetadata } from "@/lib/seo";
import { getSupportWaitParts } from "@/lib/support/schedule";
import { ContactClient } from "@/components/contact/ContactClient";
import { getTranslations } from "@/i18n/server";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "@/i18n/react";
import { contactPersonalizationQuery, contactTawkConfigQuery } from "./page.functions";
import type { PublicLocale } from "@/i18n/routing";

export async function getContactMetadata({ params }: RouteMetadataInput): Promise<PageMetadata> {
	const { locale } = params as { locale: PublicLocale };
	const t = await getTranslations({ locale: locale as PublicLocale, namespace: "Site.contact" });
	return buildMetadata({
		title: t("title"),
		description: t("intro"),
		path: "/contact",
		keywords: ["Phaseo support", "contact Phaseo", "AI gateway support", "AI model database help"],
	});
}

// Tawk ids (server env), support hours and personalisation load through
// server functions (page.functions.ts).
function ContactPersonalization() {
	const locale = useLocale();
	const t = useTranslations("Site.contact");
	const { data: { isOpen, minutesUntilNextWindow, now, personalization } } = useSuspenseQuery(contactPersonalizationQuery());
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
	const { data: { tawkPropertyId, tawkWidgetId } } = useSuspenseQuery(contactTawkConfigQuery());
	const londonTimeLabel = new Intl.DateTimeFormat(locale, {
		weekday: "short",
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		timeZone: "Europe/London",
	}).format(new Date(now));

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

export function ContactPage() {
	const { data: { tawkPropertyId, tawkWidgetId } } = useSuspenseQuery(contactTawkConfigQuery());
	const t = useTranslations("Site.contact");

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
