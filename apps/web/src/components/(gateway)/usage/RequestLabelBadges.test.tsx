import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import settingsMessages from "../../../../messages/en-GB/settings-ui.json";
import RequestLabelBadges from "./RequestLabelBadges";
import type { RequestClassifierSummary } from "./requestClassifierLabels";

jest.mock("next/navigation", () => ({
	useSearchParams: () => new URLSearchParams("usage_preset=last_7d&req=G-1&label_op=is_not"),
}));

const classifiers: RequestClassifierSummary[] = [
	{ id: "c1", name: "Department", enabled: true, dimensions: [{ key: "department", name: "Department", multiple: false, values: ["legal", "sales"] }] },
];

const render = (labels: unknown, max?: number) => renderToStaticMarkup(
	<NextIntlClientProvider locale="en-GB" timeZone="UTC" messages={{ SettingsUI: settingsMessages }}>
		<RequestLabelBadges labels={labels} classifiers={classifiers} max={max} />
	</NextIntlClientProvider>,
);

describe("RequestLabelBadges", () => {
	it("shows labels as badges that filter the logs, keeping the time range", () => {
		const html = render([{ key: "department", value: "legal" }, { key: "team", value: "search" }]);
		expect(html).toContain(">Department<");
		expect(html).toContain(">legal<");
		expect(html).toContain(">team<");
		expect(html).toContain('href="/settings/usage/logs/requests?usage_preset=last_7d&amp;label_key=department&amp;label_value=legal"');
		expect(html).toContain("Show requests where Department is legal");
		expect(html).not.toContain("rounded-full");
	});

	it("names classifier calls and collapses labels past the limit", () => {
		const html = render([
			{ key: "phaseo.classifier", value: "c1" },
			{ key: "department", value: "legal" },
			{ key: "team", value: "search" },
		], 1);
		expect(html).toContain("Classifier call");
		expect(html).toContain("This request is a classifier call for Department.");
		expect(html).toContain("+2");
		expect(html).toContain("Department: legal");
	});

	it("shows a dash without labels and ignores malformed ones", () => {
		expect(render(null)).toContain("—");
		expect(render([{ key: 1, value: "x" }])).toContain("—");
	});
});
