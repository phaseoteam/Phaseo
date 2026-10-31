// Signed-in Stripe payment methods (cookies + web API).
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { webQueryKeys } from "@/lib/query/queryKeys";

const loadPaymentMethodsInitialData = createServerFn({ method: "GET" }).handler(async () => {
	const { fetchSettingsPaymentMethodsInitialData } = await import("@/lib/fetchers/internal/fetchSettingsPaymentMethodsInitialData");
	return fetchSettingsPaymentMethodsInitialData();
});

export const paymentMethodsInitialDataQuery = () =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "settings-payment-methods"],
		queryFn: () => loadPaymentMethodsInitialData(),
	});
