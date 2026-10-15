import { renderToStaticMarkup } from "react-dom/server";
import { ForecastMeter } from "./ForecastMeter";

const render = (props: Parameters<typeof ForecastMeter>[0]) => renderToStaticMarkup(<ForecastMeter {...props} />);
const widths = (markup: string, className: string) =>
	[...markup.matchAll(new RegExp(`class="[^"]*${className}[^"]*" style="[^"]*width:([\\d.]+)%`, "g"))].map((match) => Number(match[1]));

describe("ForecastMeter", () => {
	test("shows usage alone when there is no projection", () => {
		const markup = render({ used: 50, limit: 200, label: "Today" });
		expect(markup).toContain('aria-label="Today"');
		expect(markup).not.toContain("repeating-linear-gradient");
		expect(markup).not.toContain("text-amber-500");
		// The scale leaves 8% headroom so the limit tick never sits on the edge.
		const [usedWidth] = widths(markup, "bg-chart-4");
		expect(usedWidth).toBeCloseTo((50 / 216) * 100, 5);
		expect(markup).toMatch(/bg-foreground" style="left:92\.59/);
	});

	test("hatches a projection that stays under the limit in the usage colour", () => {
		const markup = render({ used: 40, projected: 100, limit: 200, label: "This month" });
		expect(markup).toContain("text-chart-4/85");
		expect(markup).not.toContain("text-amber-500");
	});

	test("turns only the projection past the limit amber", () => {
		const markup = render({ used: 96, projected: 249, limit: 200, label: "This month" });
		const scale = 249 * 1.08;
		const [within] = widths(markup, "text-chart-4/85");
		const [over] = widths(markup, "text-amber-500");
		expect(within).toBeCloseTo(((200 - 96) / scale) * 100, 5);
		expect(over).toBeCloseTo(((249 - 200) / scale) * 100, 5);
	});

	test("omits the limit tick for keys without a limit", () => {
		const markup = render({ used: 10, projected: 30, limit: 0, label: "This week" });
		expect(markup).not.toContain("bg-foreground");
		expect(markup).toContain("text-chart-4/85");
	});
});
