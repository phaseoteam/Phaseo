import { it, expect, afterEach, vi, type Mock } from "vitest";
import { isValidElement, useState, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChartTooltip } from "@/components/ui/chart";
import { UsageStackedBar } from "./UsageStackedBar";
import { keyForSeries } from "./chart-colors";

vi.mock("@/i18n/react", () => ({ useLocale: () => "en-GB", useTranslations: () => (key: string) => key === "usageTotal" ? "Total" : key }));
vi.mock("@/components/providers/DisplayPreferencesProvider", () => ({ useDisplayFormatters: () => ({
    calendarDate: (value: string) => value, number: (value: number) => String(value),
}) }));
vi.mock("@/lib/web-api/client", () => ({}));
vi.mock("@/lib/fetchers/frontend/fetchRankingSections", () => ({}));
vi.mock("react", async () => ({
	...(await vi.importActual("react")),
	useEffect: vi.fn(),
	useState: vi.fn((initial) => [typeof initial === "function" ? initial() : initial, vi.fn()]),
}));
vi.mock("@/components/link", () => ({ default: () => null }));
vi.mock("lucide-react", () => ({ Check: () => null, ChevronDown: () => null }));
vi.mock("recharts", () => ({ BarChart: () => null, Bar: () => null, XAxis: () => null, YAxis: () => null, CartesianGrid: () => null }));
vi.mock("@/components/Logo", () => ({ Logo: () => null }));
vi.mock("@/components/ui/chart", () => ({ ChartContainer: () => null, ChartTooltip: () => null }));
vi.mock("@/components/ui/button", () => ({ Button: () => null }));
vi.mock("@/components/ui/dropdown-menu", () => ({
	DropdownMenu: () => null, DropdownMenuContent: () => null, DropdownMenuItem: () => null, DropdownMenuTrigger: () => null,
}));
vi.mock("@/components/(rankings)/EmptyChartPreview", () => ({ EmptyChartPreview: () => null }));
vi.mock("@/components/(rankings)/EmptyLeaderboardPreview", () => ({ EmptyLeaderboardPreview: () => null }));

function findTooltip(node: ReactNode): ReactElement | undefined {
	if (Array.isArray(node)) {
		for (const child of node) {
			const found = findTooltip(child);
			if (found) return found;
		}
	}
	if (!isValidElement<{ children?: ReactNode }>(node)) return;
	return node.type === ChartTooltip ? node : findTooltip(node.props.children);
}

afterEach(() => vi.restoreAllMocks());

it.each([false, true])("includes models outside the visible top ten in chart totals (hover=%s)", (hover) => {
	vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-05T12:00:00Z"));
	if (hover) (useState as Mock).mockImplementationOnce(() => [keyForSeries("lab/model1"), vi.fn()]);
	const models = Array.from({ length: 12 }, (_, index) => ({
		bucket: "2026-09-28T00:00:00Z", model_id: `lab/model${index + 1}`, tokens: index + 1, requests: 1,
	}));
	const tree = UsageStackedBar({ data: [...models, { bucket: models[0].bucket, model_id: "Other", tokens: 22, requests: 1 }], metric: "tokens" });
	const tooltip = findTooltip(tree);
	expect(tooltip).toBeDefined();
	const payload = [...models.map((model) => ({ dataKey: keyForSeries(model.model_id), value: model.tokens })),
		{ dataKey: "other", value: 22 }, { dataKey: "projected_pace", value: 500 }];
	const content = (tooltip!.props as { content: (props: { payload: typeof payload; label: string }) => ReactNode }).content;
	const html = renderToStaticMarkup(content({ payload, label: "Sep 28" }));
	expect(html).toContain("Total");
	expect(html).toMatch(/>100<\/span>/);
	// The per-model display stays capped, but its total remains the whole stack.
	expect(html).not.toContain("lab/model2");
});
