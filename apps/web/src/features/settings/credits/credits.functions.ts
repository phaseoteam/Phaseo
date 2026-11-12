// Signed-in billing data for the Credits settings pages (cookies + web API,
// Supabase and Stripe for top-up reviews).
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { webQueryKeys } from "@/lib/query/queryKeys";
import type { CreditTopupRow, CreditTopupStatus } from "@/lib/server/creditTopups";

const loadCreditsInitialData = createServerFn({ method: "GET", strict: { output: false } }).handler(async () => {
	const { fetchSettingsCreditsInitialData } = await import("@/lib/fetchers/internal/fetchSettingsCreditsInitialData");
	return fetchSettingsCreditsInitialData();
});

export const creditsInitialDataQuery = () =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "settings-credits"],
		queryFn: () => loadCreditsInitialData(),
	});

export const loadCreditsOnboardingInitialData = createServerFn({ method: "GET" }).handler(async () => {
	const { fetchSettingsCreditsOnboardingInitialData } = await import("@/lib/fetchers/internal/fetchSettingsCreditsOnboardingInitialData");
	return fetchSettingsCreditsOnboardingInitialData();
});

export const creditsOnboardingInitialDataQuery = () =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "settings-credits-onboarding"],
		queryFn: () => loadCreditsOnboardingInitialData(),
	});

export type CreditTopupReviewData =
	| { kind: "notFound" }
	| { kind: "forbidden" }
	| {
			kind: "review";
			id: string;
			flow: CreditTopupRow["flow"];
			status: CreditTopupStatus;
			amount: string;
			reason: string | null;
			paymentMethodBrand: string | null;
			paymentMethodLast4: string | null;
			workspaceName: string;
			requesterEmail: string | null;
			resume: boolean;
			declaredCountryCode: string | null;
			expiresAt: string;
	  };

// Viewing the review never changes the request; this only reads it.
const loadCreditTopupReview = createServerFn({ method: "GET" })
	.validator((id: string) => String(id))
	.handler(async ({ data: id }): Promise<CreditTopupReviewData> => {
		const [{ createClient }, { createAdminClient }, topups, { getStripe }] = await Promise.all([
			import("@/utils/supabase/server"),
			import("@/utils/supabase/admin"),
			import("@/lib/server/creditTopups"),
			import("@/lib/stripe"),
		]);
		const supabase = await createClient();
		const { data: { user } } = await supabase.auth.getUser();
		const admin = createAdminClient();
		const review = user?.id
			? await topups.loadCreditTopupForReviewer({
					db: admin,
					id,
					userId: user.id,
					lookupEmail: async (userId) => {
						const result = await admin.auth.admin.getUserById(userId);
						return result.data.user?.email ?? null;
					},
				})
			: null;

		if (!review) return { kind: "notFound" };
		if (!review.canDecide) return { kind: "forbidden" };

		const { row } = review;
		const status: CreditTopupStatus = topups.isTopupExpired(row) ? "expired" : row.status;
		// A reload during 3D Secure leaves a confirmed request waiting on the bank: offer Resume.
		const resume = await topups.needsAuthenticationResume(getStripe(), row);
		const { data: profile } = await admin.from("users").select("declared_country_code").eq("user_id", user!.id).maybeSingle();
		const expiresAt = new Date(row.expires_at).toLocaleString("en-US", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" });
		return {
			kind: "review",
			id: row.id,
			flow: row.flow,
			status,
			amount: topups.formatTopupUsd(row.amount_cents),
			reason: row.reason,
			paymentMethodBrand: row.payment_method_brand,
			paymentMethodLast4: row.payment_method_last4,
			workspaceName: review.workspaceName,
			requesterEmail: review.requesterEmail,
			resume,
			declaredCountryCode: typeof profile?.declared_country_code === "string" ? profile.declared_country_code : null,
			expiresAt,
		};
	});

export const creditTopupReviewQuery = (id: string) =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "settings-credit-topup-review", id],
		queryFn: () => loadCreditTopupReview({ data: id }),
	});
