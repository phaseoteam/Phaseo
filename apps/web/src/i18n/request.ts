import { notFound } from "@/lib/navigation";
import { getRequestConfig } from "@/i18n/server";
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
