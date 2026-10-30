import { englishMessages } from "@/i18n/default-messages";
import type { RuntimeLocale } from "@/i18n/routing";

// `next-intl` resolves to src/compat/next-intl.tsx, which re-exports use-intl.
declare module "use-intl" {
	interface AppConfig {
		Locale: RuntimeLocale;
		Messages: typeof englishMessages;
	}
}
