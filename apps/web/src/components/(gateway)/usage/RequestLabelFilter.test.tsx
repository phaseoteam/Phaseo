import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppIntlProvider } from "@/i18n/react";
import settingsMessages from "../../../../messages/en-GB/settings-ui.json";
import RequestLabelFilter, { readActiveLabelFilter } from "./RequestLabelFilter";
import type { RequestClassifierSummary } from "./requestClassifierLabels";

const mockState: { current: { label_key: string; label_value: string; label_op: string } } = { current: { label_key: "", label_value: "", label_op: "" } };
jest.mock("nuqs", () => ({
	parseAsString: { withDefault: () => ({}) },
	useQueryStates: () => [mockState.current, jest.fn()],
}));
// The popover content is only mounted when open; the trigger carries the state.
jest.mock("@/components/ui/popover", () => {
	const Pass = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
	return { Popover: Pass, PopoverTrigger: Pass, PopoverContent: () => null };
});

const classifiers: RequestClassifierSummary[] = [
	{ id: "c1", name: "Departments", enabled: true, dimensions: [{ key: "department", name: "Department", multiple: false, values: ["legal"] }] },
];

const render = (state: Partial<typeof mockState.current>, mode: "logs" | "usage" = "logs") => {
	mockState.current = { label_key: "", label_value: "", label_op: "", ...state };
	return renderToStaticMarkup(
		<AppIntlProvider locale="en-GB" timeZone="UTC" messages={{ SettingsUI: settingsMessages }}>
			<RequestLabelFilter facets={[{ key: "team", value: "search" }]} classifiers={classifiers} mode={mode} />
		</AppIntlProvider>,
	);
};

describe("readActiveLabelFilter", () => {
	it("accepts any value and is not in the logs only", () => {
		expect(readActiveLabelFilter({ label_key: "team", label_value: "", label_op: "" }, "logs")).toEqual({ key: "team", value: null, exclude: false });
		expect(readActiveLabelFilter({ label_key: "team", label_value: "a", label_op: "is_not" }, "logs")).toEqual({ key: "team", value: "a", exclude: true });
		expect(readActiveLabelFilter({ label_key: "team", label_value: "", label_op: "" }, "usage")).toBeNull();
		expect(readActiveLabelFilter({ label_key: "team", label_value: "a", label_op: "is_not" }, "usage")).toBeNull();
		expect(readActiveLabelFilter({ label_key: "team", label_value: "a", label_op: "" }, "usage")).toEqual({ key: "team", value: "a", exclude: false });
		expect(readActiveLabelFilter({ label_key: "", label_value: "a", label_op: "" }, "logs")).toBeNull();
	});
});

describe("RequestLabelFilter", () => {
	it("shows classifier dimensions by name", () => {
		expect(render({ label_key: "department", label_value: "legal" })).toContain("Department: legal");
		expect(render({ label_key: "department", label_value: "legal", label_op: "is_not" })).toContain("Department: not legal");
		expect(render({ label_key: "department" })).toContain("Department has any value");
		expect(render({ label_key: "department", label_op: "is_not" })).toContain("Department is not set");
	});

	it("names classifier calls by classifier and keeps caller keys as sent", () => {
		expect(render({ label_key: "phaseo.classifier", label_value: "c1" })).toContain("Classifier calls: Departments");
		expect(render({ label_key: "team", label_value: "search" })).toContain("team: search");
	});

	it("shows only exact filters as active on the usage overview", () => {
		const html = render({ label_key: "department", label_op: "is_not" }, "usage");
		expect(html).toContain(">Label<");
		expect(html).not.toContain("Clear label filter");
	});
});
