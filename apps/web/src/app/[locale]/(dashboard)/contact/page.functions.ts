import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

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

/** Tawk widget ids come from server env. */
export const getContactTawkConfig = createServerFn({ method: "GET" }).handler(async () => getTawkConfig());

/**
 * Support hours and the signed-in account's personalisation (cookies). The
 * clock is read on the server so SSR and hydration render the same status.
 */
export const getContactPersonalizationData = createServerFn({ method: "GET" }).handler(async () => {
	const [{ getSupportAvailability }, { fetchContactPersonalization }] = await Promise.all([
		import("@/lib/support/schedule"),
		import("@/lib/fetchers/internal/fetchContactPersonalization"),
	]);
	const { isOpen, minutesUntilNextWindow } = getSupportAvailability();
	const personalization = await fetchContactPersonalization();
	return { isOpen, minutesUntilNextWindow, now: new Date().toISOString(), personalization };
});

export const contactTawkConfigQuery = () =>
	queryOptions({
		queryKey: ["contact", "tawk-config"],
		queryFn: () => getContactTawkConfig(),
		staleTime: Infinity,
	});

export const contactPersonalizationQuery = () =>
	queryOptions({
		queryKey: ["contact", "personalization"],
		queryFn: () => getContactPersonalizationData(),
	});
