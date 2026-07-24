import type { SettingsPaymentMethodsInitialData } from "@/lib/fetchers/internal/settingsTypes";
import { getServerAccountContext } from "@/lib/fetchers/internal/serverAccountContext";
import { getActiveTeamStripeSummary } from "@/lib/server/activeTeamStripe";

export async function fetchSettingsPaymentMethodsInitialData(): Promise<SettingsPaymentMethodsInitialData> {
	const context = await getServerAccountContext();
	if (!context.workspaceId) {
		return {
			customerId: null,
			initialData: {
				customer: { id: "", email: null },
				defaultPaymentMethodId: null,
				paymentMethods: [],
			},
			obfuscateInfo: context.obfuscateInfo ?? false,
		};
	}

	const stripe = await getActiveTeamStripeSummary();
	return {
		customerId: stripe.customer.id,
		initialData: {
			customer: stripe.customer,
			defaultPaymentMethodId: stripe.defaultPaymentMethodId,
			paymentMethods: stripe.paymentMethods,
		},
		obfuscateInfo: context.obfuscateInfo ?? false,
	};
}
