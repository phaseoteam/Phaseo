import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import settingsMessages from "../../../../messages/en-GB/settings-ui.json";
import UsageLabelBreakdown, { buildLabelBreakdownRows } from "./UsageLabelBreakdown";
import { buildLabelKeyOptions, type RequestClassifierSummary } from "./requestClassifierLabels";

const mockQuery: { current: Record<string, unknown> } = { current: {} };
const mockCalls: Array<{ resource: string; params: Record<string, string>; enabled: boolean }> = [];
jest.mock("./PrivateUsageQuery", () => ({
	usePrivateUsageRefresh: () => ({ scope: { userId: "user-1", workspaceId: "workspace-1" } }),
	usePrivateUsageQuery: (_scope: unknown, resource: string, params: Record<string, string>, _live: boolean, _fetcher: unknown, enabled: boolean) => {
		mockCalls.push({ resource, params, enabled });
		return mockQuery.current;
	},
}));
jest.mock("@/lib/query/fetchPrivateUsage", () => ({ fetchPrivateUsage: jest.fn() }));
// The select's popup needs a browser; the trigger is what matters here.
jest.mock("@/components/ui/select", () => {
	const Pass = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
	return { Select: Pass, SelectContent: () => null, SelectGroup: Pass, SelectItem: Pass, SelectLabel: Pass, SelectTrigger: ({ children }: { children?: React.ReactNode }) => <button type="button">{children}</button> };
});

const classifiers: RequestClassifierSummary[] = [
	{ id: "c1", name: "Department", enabled: true, dimensions: [{ key: "department", name: "Department", multiple: false, values: ["legal", "sales", "other"] }] },
];

const render = (props: Partial<React.ComponentProps<typeof UsageLabelBreakdown>> = {}) => renderToStaticMarkup(
	<NextIntlClientProvider locale="en-GB" timeZone="UTC" messages={{ SettingsUI: settingsMessages }}>
		<UsageLabelBreakdown facets={[]} classifiers={classifiers} from="2026-10-01T00:00:00.000Z" to="2026-10-08T00:00:00.000Z" {...props} />
	</NextIntlClientProvider>,
);

beforeEach(() => {
	mockCalls.length = 0;
	mockQuery.current = {};
});

describe("buildLabelBreakdownRows", () => {
	const row = (value: string, costNanos: number) => ({ value, requests: 2, successfulRequests: 1, costNanos, tokens: 10, inputTokens: 6, outputTokens: 4 });
	it("adds unused allowed classifier values at zero after the used ones", () => {
		const option = buildLabelKeyOptions([], classifiers)[0];
		expect(buildLabelBreakdownRows(option, [row("sales", 9)]).map((entry) => [entry.value, entry.used, entry.requests])).toEqual([
			["sales", true, 2],
			["legal", false, 0],
			["other", false, 0],
		]);
	});
	it("names classifier calls and leaves caller keys as they are", () => {
		const options = buildLabelKeyOptions([{ key: "team", value: "a" }], classifiers);
		const calls = options.find((option) => option.kind === "classifier_calls")!;
		expect(buildLabelBreakdownRows(calls, [row("c1", 5)])[0]).toMatchObject({ value: "c1", label: "Department", used: true });
		const caller = options.find((option) => option.kind === "caller")!;
		expect(buildLabelBreakdownRows(caller, [row("a", 1)]).map((entry) => entry.value)).toEqual(["a"]);
	});
});

describe("UsageLabelBreakdown", () => {
	it("groups by the first classifier dimension and shows totals in US dollars", () => {
		mockQuery.current = {
			isPending: false,
			isError: false,
			data: { key: "department", workspaceId: "workspace-1", rows: [
				{ value: "legal", requests: 3, successfulRequests: 3, costNanos: 12_500_000_000, tokens: 1200, inputTokens: 1000, outputTokens: 200 },
				{ value: "sales", requests: 1, successfulRequests: 0, costNanos: 2_500_000_000, tokens: 300, inputTokens: 200, outputTokens: 100 },
			] },
		};
		const html = render({ keyId: "key-1", creatorId: "user-2", labelFilterActive: true });
		expect(mockCalls.at(-1)).toEqual({
			resource: "label-breakdown",
			params: { label_key: "department", from: "2026-10-01T00:00:00.000Z", to: "2026-10-08T00:00:00.000Z", key: "key-1", key_op: "", user: "user-2" },
			enabled: true,
		});
		expect(html).toContain("Usage by label");
		expect(html).toContain("$12.50");
		expect(html).toContain("$15.00");
		expect(html).toContain("83%");
		expect(html).toContain("other");
		expect(html).toContain("This table ignores the label filter above.");
		expect(html).not.toMatch(/rounded-(full|lg|xl)/);
	});

	it("explains when there is nothing to group by and does not query", () => {
		const html = render({ classifiers: [] });
		expect(html).toContain("No labels or classifiers to group by yet.");
		expect(mockCalls.at(-1)?.enabled).toBe(false);
	});

	it("reports a failed load without breaking the page", () => {
		mockQuery.current = { isPending: false, isError: true };
		expect(render()).toContain("Couldn&#x27;t load usage by label.");
	});
});
