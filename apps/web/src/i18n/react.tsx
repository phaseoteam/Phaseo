// `next-intl` (client APIs) on use-intl, the library next-intl wraps.
import { IntlProvider, useLocale as useIntlLocale, type AbstractIntlMessages, type Locale } from "use-intl";
import type { ComponentProps, ReactNode } from "react";
import { defaultLocale, isPublicLocale } from "@/i18n/locales";

export {
	createTranslator,
	createFormatter,
	hasLocale,
	useFormatter,
	useLocale,
	useMessages,
	useNow,
	useTimeZone,
	useTranslations,
	IntlError,
	IntlErrorCode,
	type AbstractIntlMessages,
	type Locale,
	type Messages,
	type RichTranslationValues,
	type TranslationValues,
} from "use-intl";

function useOptionalParentLocale(): string | undefined {
	try {
		// eslint-disable-next-line react-hooks/rules-of-hooks -- returns the parent provider's locale when nested.
		return useIntlLocale();
	} catch {
		return undefined;
	}
}

function localeFromLocation(): string {
	if (typeof window === "undefined") return defaultLocale;
	const first = window.location.pathname.split("/")[1] ?? "";
	return isPublicLocale(first) ? first : defaultLocale;
}

type ProviderProps = Omit<ComponentProps<typeof IntlProvider>, "locale" | "messages"> & {
	locale?: string;
	messages?: AbstractIntlMessages | null;
	children?: ReactNode;
};

export function AppIntlProvider({ locale, messages, timeZone, children, ...rest }: ProviderProps) {
	const parentLocale = useOptionalParentLocale();
	return (
		<IntlProvider
			locale={(locale ?? parentLocale ?? localeFromLocation()) as Locale}
			messages={messages ?? undefined}
			timeZone={timeZone ?? "UTC"}
			{...rest}
		>
			{children}
		</IntlProvider>
	);
}
