import { notFound } from "next/navigation";
import { getRequestConfig } from "next-intl/server";
import { getPublicMessages } from "./messages";
import { isPublicLocale } from "./routing";

export default getRequestConfig(async ({ locale: explicitLocale, requestLocale }) => {
	const requestedLocale = explicitLocale ?? (await requestLocale);
	if (!isPublicLocale(requestedLocale)) {
		notFound();
	}

	return {
		locale: requestedLocale,
		messages: await getPublicMessages(requestedLocale),
	};
});
