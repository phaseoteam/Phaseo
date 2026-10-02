import { renderToStaticMarkup } from "react-dom/server";

import { FAQSection } from "./FAQSection";

jest.mock("next-intl", () => ({
	useTranslations: () => {
		const translate = (key: string) => key;
		translate.rich = (key: string, values: Record<string, (children: string) => unknown>) =>
			Object.entries(values).reduce<unknown>((result, [tag, render]) => render(String(result)), key);
		return translate;
	},
}));

jest.mock("@/i18n/navigation", () => ({
	Link: ({ children }: { children: unknown }) => children,
}));

describe("FAQSection", () => {
	it("removes collapsed answers from accessibility and keyboard navigation", () => {
		const html = renderToStaticMarkup(<FAQSection />);

		expect(html).toContain('aria-expanded="false"');
		expect(html).toContain('aria-hidden="true"');
		expect(html).toContain('inert=""');
	});
});
