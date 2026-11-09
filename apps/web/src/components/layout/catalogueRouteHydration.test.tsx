import { it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { AppIntlProvider } from "@/i18n/react";
import { useLocation } from "@tanstack/react-router";
import CatalogueScrollToTop from "./CatalogueScrollToTop";
import DashboardFooterGate from "./DashboardFooterGate";

// The router location carries the locale prefix on the server and not in the browser.
vi.mock("@tanstack/react-router", async () => ({
	...(await vi.importActual("@tanstack/react-router")),
	useLocation: vi.fn(),
}));

function renderRoute(pathname: string, locale: NonNullable<ComponentProps<typeof AppIntlProvider>["locale"]>, children: React.ReactNode) {
	vi.mocked(useLocation).mockImplementation(((options?: { select?: (location: { pathname: string }) => unknown }) =>
		options?.select ? options.select({ pathname }) : { pathname }) as never);
	return renderToStaticMarkup(
		<AppIntlProvider locale={locale} timeZone="UTC" messages={{
			Common: { ui: { accessibility: { scrollToTop: "Scroll to top" } } },
		}}>
			{children}
		</AppIntlProvider>,
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

it.each(["es-ES", "fr-FR", "de-DE"] as const)("recognises catalogue routes in %s", (locale) => {
	expect(renderRoute(`/${locale}/models`, locale, <CatalogueScrollToTop />))
		.toContain('aria-label="Scroll to top"');
});
