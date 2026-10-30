import type { AnchorHTMLAttributes } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { publicLocales } from "@/i18n/routing";
import { LocaleSwitcher } from "./LocaleSwitcher";

jest.mock("@/i18n/navigation", () => ({
	Link: ({
		locale,
		href,
		prefetch,
		...props
	}: AnchorHTMLAttributes<HTMLAnchorElement> & {
		locale: string;
		href: string;
		prefetch?: boolean;
	}) => {
		void prefetch;
		return <a {...props} href={`/${locale}${href}`} />;
	},
}));

describe("LocaleSwitcher", () => {
	it("renders every public locale with isolated language direction", () => {
		const markup = renderToStaticMarkup(
			<LocaleSwitcher
				currentLocale="ar-SA"
				returnPath="/sign-in"
				label="Language"
				placement="top"
			/>,
		);

		expect(markup).toContain('aria-label="Language"');
		expect(markup).toContain('<bdi lang="ar-SA" dir="rtl">العربية</bdi>');
		expect(markup.match(/hrefLang=/g)).toHaveLength(publicLocales.length);
		expect(markup).toContain('aria-current="page"');
		expect(markup).toContain("bottom-full");
		expect(markup).toContain("/flags/sa.svg");
		expect(markup).toContain("/flags/gb.svg");
	});
});
