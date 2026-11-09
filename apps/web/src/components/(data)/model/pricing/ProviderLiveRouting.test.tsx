import { expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { AppIntlProvider } from "@/i18n/react";
import catalogue from "../../../../../messages/en-GB/catalogue.json";
import type { ProviderRoutingStatus } from "@/lib/fetchers/models/getModelProviderRoutingHealth";
import { ProviderLiveRoutingIndicator, liveRoutingState, useLiveRouting } from "./ProviderLiveRouting";

vi.mock("@/i18n/navigation", () => ({
	Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a>,
}));

const healthy: ProviderRoutingStatus = {
	providerId: "p", deranked: false, recovering: false, openCount: 0, halfOpenCount: 0, checkedPairs: 2,
};
const open: ProviderRoutingStatus = { ...healthy, deranked: true, openCount: 1 };
const halfOpen: ProviderRoutingStatus = { ...healthy, recovering: true, halfOpenCount: 2 };

function render(node: ReactNode) {
	return load(renderToStaticMarkup(
		<AppIntlProvider locale="en-GB" timeZone="UTC" messages={{ Catalogue: catalogue }}>{node}</AppIntlProvider>,
	));
}

function indicator(routingStatus: ProviderRoutingStatus | null, statusKey = "active") {
	return render(<ProviderLiveRoutingIndicator routingStatus={routingStatus} statusKey={statusKey}
		docsHref="https://phaseo.app/docs/v1/guides/provider-statuses" docsLabel="Learn more" />)("button");
}

test("shows nothing while routing is normal or the route is not routed", () => {
	expect(indicator(null)).toHaveLength(0);
	expect(indicator(healthy)).toHaveLength(0);
	for (const statusKey of ["disabled", "inactive", "coming_soon", "external", "not_listed"]) {
		expect(indicator(open, statusKey)).toHaveLength(0);
	}
});

test("shows an open breaker as temporarily limited, also on a hand-set lower-priority route", () => {
	for (const statusKey of ["active", "deranked"]) {
		const button = indicator(open, statusKey);
		expect(button.attr("data-live-routing")).toBe("limited");
		expect(button.attr("aria-label")).toBe("Live routing: Temporarily limited");
	}
});

test("shows a breaker being retested as recovering, and an open breaker wins", () => {
	expect(indicator(halfOpen).attr("aria-label")).toBe("Live routing: Recovering");
	expect(liveRoutingState({ ...open, recovering: true }, "active")).toBe("limited");
});

test("explains the state, its route count, and that it is automatic", () => {
	function Copy({ status }: { status: ProviderRoutingStatus }) {
		const live = useLiveRouting(status, "active");
		return <p>{live?.label}|{live?.description}|{live?.automatic}</p>;
	}
	expect(render(<Copy status={open} />)("p").text()).toBe(
		"Temporarily limited|Requests to this provider failed repeatedly, so Phaseo is sending traffic to other providers first (1 route affected).|"
		+ "This happens automatically and clears once requests succeed again. It is separate from the status icon before it, which Phaseo sets by hand.",
	);
	expect(render(<Copy status={halfOpen} />)("p").text()).toContain("check that this provider works again (2 routes)");
});
