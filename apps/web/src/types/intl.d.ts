import { englishMessages } from "@/i18n/default-messages";
import type { RuntimeLocale } from "@/i18n/routing";

// Typed messages and locales for use-intl (re-exported by @/i18n/react).
declare module "use-intl" {
	interface AppConfig {
		Locale: RuntimeLocale;
		Messages: typeof englishMessages;
	}
}
