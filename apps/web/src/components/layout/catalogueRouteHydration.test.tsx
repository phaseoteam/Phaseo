import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { usePathname } from "next/navigation";
import CatalogueScrollToTop from "./CatalogueScrollToTop";
import DashboardFooterGate from "./DashboardFooterGate";

jest.mock("next/navigation", () => ({
	...jest.requireActual("next/navigation"),
	usePathname: jest.fn(),
}));

function renderRoute(pathname: string, locale: string, children: React.ReactNode) {
	jest.mocked(usePathname).mockReturnValue(pathname);
	return renderToStaticMarkup(
		<NextIntlClientProvider locale={locale} timeZone="UTC" messages={{
			Common: { ui: { accessibility: { scrollToTop: "Scroll to top" } } },
		}}>
			{children}
		</NextIntlClientProvider>,
	);
}

it.each(["/models", "/models/example/model", "/apps", "/api-providers"])(
	"keeps scroll-control markup identical across the locale rewrite for %s", (pathname) => {
		const server = renderRoute(`/en-GB${pathname}`, "en-GB", <CatalogueScrollToTop />);
		const browser = renderRoute(pathname, "en-GB", <CatalogueScrollToTop />);
		expect(server).toContain('aria-label="Scroll to top"');
		expect(server).toBe(browser);
	},
);

it.each(["/chat", "/chat/session", "/settings", "/settings/usage"])(
	"keeps the footer absent across the locale rewrite for %s", (pathname) => {
		const server = renderRoute(`/en-GB${pathname}`, "en-GB", <DashboardFooterGate><footer>Footer</footer></DashboardFooterGate>);
		const browser = renderRoute(pathname, "en-GB", <DashboardFooterGate><footer>Footer</footer></DashboardFooterGate>);
		expect(server).toBe("");
		expect(server).toBe(browser);
	},
);

it("keeps non-catalogue pages free of the scroll control", () => {
	expect(renderRoute("/en-GB/privacy", "en-GB", <CatalogueScrollToTop />)).toBe("");
});

it.each(["es-ES", "fr-FR", "de-DE"])("recognises catalogue routes in %s", (locale) => {
	expect(renderRoute(`/${locale}/models`, locale, <CatalogueScrollToTop />))
		.toContain('aria-label="Scroll to top"');
});
