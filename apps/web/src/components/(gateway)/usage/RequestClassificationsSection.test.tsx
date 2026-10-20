import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import settingsMessages from "../../../../messages/en-GB/settings-ui.json";
import RequestClassificationsSection, { readRequestClassifications } from "./RequestClassificationsSection";
import type { RequestClassifierSummary } from "./requestClassifierLabels";

jest.mock("next/navigation", () => ({
	useSearchParams: () => new URLSearchParams("usage_preset=last_7d"),
}));

const classifiers: RequestClassifierSummary[] = [
	{ id: "c1", name: "Department", enabled: true, dimensions: [{ key: "department", name: "Department", multiple: false, values: ["legal", "sales"] }] },
	{ id: "c2", name: "Intent", enabled: true, dimensions: [{ key: "intent", name: "Intent", multiple: true, values: ["draft", "review"] }] },
];

const render = (detailMetadata: unknown, list = classifiers) => renderToStaticMarkup(
	<NextIntlClientProvider locale="en-GB" timeZone="UTC" messages={{ SettingsUI: settingsMessages }}>
		<RequestClassificationsSection detailMetadata={detailMetadata} classifiers={list} />
	</NextIntlClientProvider>,
);

describe("RequestClassificationsSection", () => {
	it("shows each classifier's answers, status, model, cost and a link to the classifier call", () => {
		const html = render({
			labels: [{ key: "team", value: "search" }, { key: "department", value: "legal" }, { key: "intent", value: "draft" }],
			classifications: [
				{ classifier_id: "c1", status: "classified", model: "openai/gpt-5-mini", labels: [{ key: "department", value: "legal", confidence: 0.92 }], response_id: "req_classifier_1", cost_nanos: 42_000 },
				{ classifier_id: "c2", status: "session_cache", model: "openai/gpt-5-mini", labels: [{ key: "intent", value: "draft", confidence: null }] },
				{ classifier_id: "c-deleted", status: "budget_reached", model: "m", labels: [] },
				{ classifier_id: "c-bad", status: "unknown", labels: [] },
			],
		});
		expect(html).toContain("Classifications");
		expect(html).toContain("Department");
		expect(html).toContain("legal");
		expect(html).toContain("92% confidence");
		expect(html).toContain("Classified");
		expect(html).toContain("Reused from session");
		expect(html).toContain("Budget reached");
		expect(html).toContain("openai/gpt-5-mini");
		expect(html).toContain("$0.000042");
		expect(html).toContain('href="/settings/usage/logs/requests/req_classifier_1?usage_preset=last_7d"');
		// Unknown classifiers fall back to their id; malformed outcomes are dropped.
		expect(html).toContain("c-deleted");
		expect(html).not.toContain("c-bad");
		// The caller's own label is listed apart from classifier answers.
		expect(html).toContain("Sent with the request");
		expect(html).toContain("team");
	});

	it("says which classifier a classifier call ran for", () => {
		const html = render({ labels: [{ key: "phaseo.classifier", value: "c2" }] });
		expect(html).toContain("This request is a classifier call for Intent.");
		expect(html).toContain("Labels");
		expect(html).not.toContain("phaseo.classifier");
	});

	it("renders nothing for a request without labels", () => {
		expect(render({})).toBe("");
		expect(render(null)).toBe("");
	});

	it("reads only well-formed outcomes", () => {
		expect(readRequestClassifications({ classifications: [{ classifier_id: "c1", status: "failed", labels: "x", cost_nanos: null }] })).toEqual([
			{ classifierId: "c1", status: "failed", model: null, labels: [], responseId: null, costNanos: null },
		]);
	});
});
