import type { Metadata } from "@/lib/seo/metadataTypes";
import { getTranslations } from "@/i18n/server";
import { useTranslations } from "@/i18n/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { use } from "react";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import CreditTopupReviewActions from "@/components/(gateway)/credits/CreditTopupReview/CreditTopupReviewActions";
import { Card, CardContent } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import type { CreditTopupStatus } from "@/lib/server/creditTopups";
import { creditTopupReviewQuery } from "../../credits.functions";

export async function generateMetadata(): Promise<Metadata> {
	const t = await getTranslations("SettingsUI.creditTopups");
	// The URL carries the single-use token; keep it out of Referer headers.
	return { title: t("title"), referrer: "no-referrer" };
}

function cardBrandLabel(brand: string): string {
	return brand.charAt(0).toUpperCase() + brand.slice(1);
}

// Viewing this page never changes the request: Confirm, Decline and Continue to payment are
// POSTs from the client component, so link scanners that open the emailed URL do nothing.
export default function CreditTopupReviewPage(props: {
	params: Promise<{ locale: string; id: string }>;
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
	const t = useTranslations("SettingsUI.creditTopups");
	const { id } = use(props.params);
	const searchParams = (props.searchParams ? use(props.searchParams) : undefined) ?? {};
	const token = typeof searchParams.token === "string" ? searchParams.token : "";

	const { data: review } = useSuspenseQuery(creditTopupReviewQuery(id));

	const header = <SettingsPageHeader title={t("title")} description={t("description")} />;

	if (review.kind === "notFound") {
		return (
			<div className="space-y-4">
				{header}
				<Callout tone="warning" title={t("notFoundTitle")}>{t("notFoundBody")}</Callout>
			</div>
		);
	}
	if (review.kind === "forbidden") {
		return (
			<div className="space-y-4">
				{header}
				<Callout tone="warning" title={t("forbiddenTitle")}>{t("forbiddenBody")}</Callout>
			</div>
		);
	}

	// Status, amount, Resume (3D Secure) and expiry are resolved on the server (credits.functions.ts).
	const { status, amount, resume, expiresAt } = review;
	const row = { id: review.id, flow: review.flow, reason: review.reason, payment_method_brand: review.paymentMethodBrand, payment_method_last4: review.paymentMethodLast4 };

	const details: Array<[string, string]> = [
		[t("amount"), amount],
		[t("workspace"), review.workspaceName],
		[
			t("card"),
			row.flow === "checkout"
				? t("newCard")
				: row.payment_method_brand && row.payment_method_last4
					? t("cardEnding", { brand: cardBrandLabel(row.payment_method_brand), last4: row.payment_method_last4 })
					: t("savedCard"),
		],
		[t("requestedBy"), review.requesterEmail ?? t("requestedByKey")],
		[t("expires"), `${expiresAt} UTC`],
	];

	return (
		<div className="space-y-4">
			{header}
			<Card className="rounded-md">
				<CardContent className="p-0">
					<dl className="divide-y">
						{details.map(([label, value]) => (
							<div key={label} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
								<dt className="text-sm text-muted-foreground">{label}</dt>
								<dd className="text-sm font-medium tabular-nums">{value}</dd>
							</div>
						))}
					</dl>
				</CardContent>
			</Card>

			{status === "pending" || resume ? (
				<CreditTopupReviewActions
					id={row.id}
					token={token}
					flow={row.flow}
					resume={resume}
					declaredCountryCode={review.declaredCountryCode}
					copy={{
						confirm: t("confirm", { amount }),
						decline: t("decline"),
						continueToPayment: t("continueToPayment", { amount }),
						country: t("country"),
						countryPlaceholder: t("countryPlaceholder"),
						countryHelp: t("countryHelp"),
						checkoutNotice: t("checkoutNotice"),
						savedCardNotice: t("savedCardNotice"),
						missingTokenTitle: t("missingTokenTitle"),
						missingTokenBody: t("missingTokenBody"),
						declinedTitle: t("declinedTitle"),
						declinedBody: t("declinedBody"),
						processingTitle: t("processingTitle"),
						processingBody: t("processingBody"),
						failedTitle: t("failedTitle"),
						failedBody: t("failedBody"),
						authenticationFailed: t("authenticationFailed"),
						notPending: t("notPending"),
						genericError: t("genericError"),
						resume: t("resume"),
						resumeNotice: t("resumeNotice"),
					}}
				/>
			) : (
				<StatusNotice status={status} reason={row.reason} amount={amount} workspace={review.workspaceName} t={t} />
			)}
		</div>
	);
}

function StatusNotice(props: {
	status: CreditTopupStatus;
	reason: string | null;
	amount: string;
	workspace: string;
	t: ReturnType<typeof useTranslations<"SettingsUI.creditTopups">>;
}) {
	const { status, reason, amount, workspace, t } = props;
	if (status === "paid") {
		return <Callout tone="success" title={t("paidTitle")}>{t("paidBody", { amount, workspace })}</Callout>;
	}
	if (status === "confirmed") {
		return <Callout tone="info" title={t("processingTitle")}>{t("processingBody")}</Callout>;
	}
	if (status === "declined") {
		return <Callout tone="info" title={t("declinedTitle")}>{t("declinedBody")}</Callout>;
	}
	if (status === "expired") {
		return <Callout tone="warning" title={t("expiredTitle")}>{t("expiredBody")}</Callout>;
	}
	return <Callout tone="critical" title={t("failedTitle")}>{t("failedReasonBody", { reason: reason ?? "payment_failed" })}</Callout>;
}
