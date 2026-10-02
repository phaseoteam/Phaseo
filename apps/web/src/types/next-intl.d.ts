import { englishMessages } from "@/i18n/default-messages";
import type { RuntimeLocale } from "@/i18n/routing";

declare module "next-intl" {
	interface AppConfig {
		Locale: RuntimeLocale;
		Messages: typeof englishMessages;
	}
}
