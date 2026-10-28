import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { connection } from "next/server";
import SettingsPageHeader from "@/components/(gateway)/settings/SettingsPageHeader";
import CreditTopupReviewActions from "@/components/(gateway)/credits/CreditTopupReview/CreditTopupReviewActions";
import { Card, CardContent } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
	formatTopupUsd,
	isTopupExpired,
	loadCreditTopupForReviewer,
	type CreditTopupStatus,
} from "@/lib/server/creditTopups";

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
export default async function CreditTopupReviewPage(props: {
	params: Promise<{ locale: string; id: string }>;
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
	await connection();
	const t = await getTranslations("SettingsUI.creditTopups");
	const { id } = await props.params;
	const searchParams = (await props.searchParams) ?? {};
	const token = typeof searchParams.token === "string" ? searchParams.token : "";

	const supabase = await createClient();
	const { data: { user } } = await supabase.auth.getUser();
	const admin = createAdminClient();
	const review = user?.id
		? await loadCreditTopupForReviewer({
				db: admin,
				id,
				userId: user.id,
				lookupEmail: async (userId) => {
					const result = await admin.auth.admin.getUserById(userId);
					return result.data.user?.email ?? null;
				},
			})
		: null;

	const header = <SettingsPageHeader title={t("title")} description={t("description")} />;

	if (!review) {
		return (
			<div className="space-y-4">
				{header}
				<Callout tone="warning" title={t("notFoundTitle")}>{t("notFoundBody")}</Callout>
			</div>
		);
	}
	if (!review.canDecide) {
		return (
			<div className="space-y-4">
				{header}
				<Callout tone="warning" title={t("forbiddenTitle")}>{t("forbiddenBody")}</Callout>
			</div>
		);
	}

	const { row } = review;
	const status: CreditTopupStatus = isTopupExpired(row) ? "expired" : row.status;
	const amount = formatTopupUsd(row.amount_cents);
	const { data: profile } = await admin.from("users").select("declared_country_code").eq("user_id", user!.id).maybeSingle();
	const expiresAt = new Date(row.expires_at).toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" });

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

			{status === "pending" ? (
				<CreditTopupReviewActions
					id={row.id}
					token={token}
					flow={row.flow}
					declaredCountryCode={typeof profile?.declared_country_code === "string" ? profile.declared_country_code : null}
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
	t: Awaited<ReturnType<typeof getTranslations<"SettingsUI.creditTopups">>>;
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
