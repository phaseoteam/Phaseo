import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup as renderMarkup } from "react-dom/server";
import { DisplayPreferencesProvider } from "@/components/providers/DisplayPreferencesProvider";
import { AppIntlProvider } from "@/i18n/react";
import settingsMessages from "../../../../messages/en-GB/settings-ui.json";
import productMessages from "../../../../messages/en-GB/product.json";
const renderToStaticMarkup = (node: React.ReactNode) => renderMarkup(<AppIntlProvider locale="en-GB" timeZone="UTC" messages={{ SettingsUI: settingsMessages, Product: productMessages }}><DisplayPreferencesProvider locale="en-GB">{node}</DisplayPreferencesProvider></AppIntlProvider>);
import React from "react";

import type { RequestRow } from "@/features/gateway/usage/server-actions";
import RequestDetailDialog, { formatRequestPricingLine } from "./RequestDetailDialog";
import { RouteRequestDetailErrorDialog } from "./RouteRequestDetailDialog";

const router = {
	push: vi.fn(),
	refresh: vi.fn(),
};

vi.mock("@/lib/navigation", () => ({
	useRouter: () => router,
	useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/ui/dialog", () => ({
	Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
	DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("@/components/(data)/model/pricing/ProviderInspectorSheet", () => ({
	ProviderInspectorSheet: ({ children, ...props }: { children: React.ReactNode; disablePointerDismissal?: boolean }) => (
		<div data-disable-pointer-dismissal={String(props.disablePointerDismissal)}>{children}</div>
	),
	ProviderInspectorSheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const historicalRequestWithoutCollections = {
	request_id: "req_historical",
	created_at: "2026-08-11T12:00:00.000Z",
	endpoint: null,
	model_id: null,
	provider: null,
	app_id: null,
	session_id: null,
	success: true,
	status_code: 200,
	error_code: null,
	error_message: null,
	error_payload: null,
	usage: null,
	cost_nanos: null,
} as RequestRow;

describe("RequestDetailDialog", () => {
	it("shows a server tool between model calls without payload logging", () => {
		const events = [
			{ type: "provider.started", span_id: "first", provider: "openai", call_kind: "initial", elapsed_ms: 10 },
			{ type: "provider.completed", span_id: "first", elapsed_ms: 20 },
			{ type: "tool.started", span_id: "tool", tool_name: "datetime", elapsed_ms: 20 },
			{ type: "tool.completed", span_id: "tool", elapsed_ms: 25 },
			{ type: "provider.started", span_id: "next", provider: "openai", call_kind: "continuation", elapsed_ms: 25 },
			{ type: "provider.completed", span_id: "next", elapsed_ms: 45 },
		].map((event, index) => ({ ...event, sequence: index + 1, timestamp_ms: 1000 + event.elapsed_ms }));
		const markup = renderToStaticMarkup(<RequestDetailDialog open onOpenChange={() => {}} request={{ ...historicalRequestWithoutCollections, detail_metadata: { lifecycle_events: { version: 1, events } } }} />);
		const timeline = markup.slice(markup.indexOf("Response timeline"));
		expect(timeline).toContain("datetime");
		expect(timeline.indexOf("Model call")).toBeLessThan(timeline.indexOf("datetime"));
		expect(timeline.indexOf("datetime")).toBeLessThan(timeline.indexOf("Model continuation"));
	});
	it("shows a request's classifications by classifier name", () => {
		const markup = renderToStaticMarkup(<RequestDetailDialog open onOpenChange={() => {}} classifiers={[{ id: "c1", name: "Department", enabled: true, dimensions: [{ key: "department", name: "Department", multiple: false, values: ["legal"] }] }]} request={{ ...historicalRequestWithoutCollections, detail_metadata: { labels: [{ key: "department", value: "legal" }], classifications: [{ classifier_id: "c1", status: "classified", model: "m", labels: [{ key: "department", value: "legal", confidence: 0.5 }], response_id: "req_c", cost_nanos: 1000 }] } }} />);
		expect(markup).toContain(">Labels<");
		expect(markup).toContain("50% confidence");
		// Labels sit after usage, below the routing and performance details.
		expect(markup.indexOf("Routing details")).toBeLessThan(markup.indexOf(">Labels<"));
		expect(markup.indexOf("Performance")).toBeLessThan(markup.indexOf(">Labels<"));
		expect(markup).toContain("/settings/usage/logs/requests/req_c");
	});
	it("always offers the Trace tab beside the overview", () => {
		const markup = renderToStaticMarkup(<RequestDetailDialog open onOpenChange={() => {}} request={historicalRequestWithoutCollections} />);
		expect(markup).toContain("Overview");
		expect(markup).toContain("Trace");
	});
	it("shows routing first and non-overlapping streaming intervals", () => {
		const markup = renderToStaticMarkup(<RequestDetailDialog open onOpenChange={() => {}} request={{
			...historicalRequestWithoutCollections,
			stream: true, provider: "openai", latency_ms: 120, generation_ms: 520,
			detail_metadata: { response_timeline: { version: 1, routing_ms: 15 } },
			provider_attempts: [{ provider: "openai", attempt_number: 1, outcome: "success", status: 200, duration_ms: 120 }],
		}} />);
		expect(markup).toContain("Response timeline");
		const timeline = markup.slice(markup.indexOf("Response timeline"));
		expect(timeline).toContain("Phaseo routing");
		expect(timeline.indexOf("Phaseo routing")).toBeLessThan(timeline.indexOf("openai"));
		expect(timeline).toContain("15 ms");
		expect(timeline).toContain("120 ms");
		expect(timeline).toContain("400 ms");
		expect(timeline).toContain("535 ms");
		expect(timeline).not.toContain("520 ms");
	});

	it("marks historical routing timing as unavailable", () => {
		const markup = renderToStaticMarkup(<RequestDetailDialog open onOpenChange={() => {}} request={historicalRequestWithoutCollections} />);
		expect(markup).toContain("Phaseo routing");
		expect(markup).toContain("Not recorded");
	});

	it("opens a historical request when optional collections are absent", () => {
		expect(() =>
			renderToStaticMarkup(
				<RequestDetailDialog
					open
					onOpenChange={() => {}}
					request={historicalRequestWithoutCollections}
				/>,
			),
		).not.toThrow();
	});

	it("keeps the loading sheet from dismissing during request transitions", () => {
		const markup = renderToStaticMarkup(
			<RequestDetailDialog
				open
				loading
				presentation="sheet"
				disablePointerDismissal
				onOpenChange={() => {}}
				request={historicalRequestWithoutCollections}
			/>,
		);

		expect(markup).toContain('data-disable-pointer-dismissal="true"');
	});

	it("renders a retryable state when a route detail cannot load", () => {
		const markup = renderToStaticMarkup(
			<RouteRequestDetailErrorDialog closeHref="/settings/usage/logs/requests" />,
		);

		expect(markup).toContain("Request details unavailable");
		expect(markup).toContain("Try again");
		expect(markup).toContain("Back to request logs");
	});
});

describe("formatRequestPricingLine", () => {
	const formatNumber = (value: number) => value.toLocaleString("en-US");

	it("shows the quantity and cost stored on gateway request lines", () => {
		expect(formatRequestPricingLine({
			dimension: "output_image_tokens",
			quantity: 824,
			line_cost_usd: "0.024720000",
			line_nanos: 24720000,
		}, formatNumber)).toBe("output_image_tokens=824 | $0.024720000 | 24,720,000 nanos");
	});

	it("names the SVG author model on its lines", () => {
		expect(formatRequestPricingLine({
			model: "openai/gpt-5-nano",
			component: "svg_author",
			dimension: "output_text_tokens",
			quantity: 8199,
			line_cost_usd: "0.003279600",
			line_nanos: 3279600,
		}, formatNumber)).toBe("SVG author (openai/gpt-5-nano) | output_text_tokens=8,199 | $0.003279600 | 3,279,600 nanos");
	});

	it("uses the translated SVG author label", () => {
		expect(formatRequestPricingLine({ model: "openai/gpt-5-nano", component: "svg_author", dimension: "input_text_tokens", quantity: 1860 }, formatNumber, { svgAuthor: "SVG-Autor" }))
			.toBe("SVG-Autor (openai/gpt-5-nano) | input_text_tokens=1,860");
	});

	it("keeps the older units and cost_usd shape", () => {
		expect(formatRequestPricingLine({ provider: "openai", dimension: "requests", units: 1, cost_usd: 0.01 }, formatNumber))
			.toBe("openai | requests=1 | $0.010000");
	});
});
