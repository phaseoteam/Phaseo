import { useTranslations } from "@/i18n/react";

/**
 * The first focusable element on every page: jumps past the header to the
 * page's main content (WCAG 2.4.1). Hidden until it receives keyboard focus.
 * Layouts mark their main region with id="main-content".
 */
export function SkipLink() {
	const t = useTranslations("Common.nav");
	return (
		<a
			href="#main-content"
			className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[200] focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
		>
			{t("skipToContent")}
		</a>
	);
}
