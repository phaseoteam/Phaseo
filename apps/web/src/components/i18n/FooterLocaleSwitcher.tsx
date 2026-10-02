"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { isPublicLocale } from "@/i18n/routing";
import { LocaleSwitcher } from "./LocaleSwitcher";

export function FooterLocaleSwitcher() {
	const locale = useLocale();
	const pathname = usePathname();
	const t = useTranslations("Auth.shared");

	if (!isPublicLocale(locale)) return null;

	return (
		<LocaleSwitcher
			currentLocale={locale}
			returnPath={pathname}
			label={t("changeLanguage")}
			placement="top"
		/>
	);
}
