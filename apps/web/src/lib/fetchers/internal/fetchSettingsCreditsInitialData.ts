import type { SettingsCreditsInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { fetchAccountWebApi } from "@/lib/web-api/client";
import { getActiveTeamStripeSummary } from "@/lib/server/activeTeamStripe";

export async function fetchSettingsCreditsInitialData(): Promise<SettingsCreditsInitialData> {
	const context = await getServerAccountContext();
	const params = new URLSearchParams();
	if (context.workspaceId) params.set("workspaceId", context.workspaceId);
	if (context.obfuscateInfo != null) params.set("obfuscateInfo", context.obfuscateInfo ? "1" : "0");
	const initialData = await fetchAccountWebApi<SettingsCreditsInitialData>(
		`/api/account/settings/credits?${params.toString()}`,
		context.accessToken,
	);
	if (!context.workspaceId) return initialData;

	const stripe = await getActiveTeamStripeSummary();
	return {
		...initialData,
		stripeInfo: {
			customer: stripe.customer,
			defaultPaymentMethodId: stripe.defaultPaymentMethodId,
			hasPaymentMethod: stripe.paymentMethods.length > 0,
			paymentMethods: stripe.paymentMethods.map((method) => ({
				id: method.id,
				card: {
					brand: method.brand,
					last4: method.last4,
					exp_month: method.expMonth,
					exp_year: method.expYear,
				},
			})),
		},
	};
}
