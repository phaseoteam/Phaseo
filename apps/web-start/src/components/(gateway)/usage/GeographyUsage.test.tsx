import { renderToStaticMarkup } from "react-dom/server";

import { GeographyUsage } from "./GeographyUsage";

describe("GeographyUsage", () => {
	it("renders the private Settings view as responsive cards and a desktop table", () => {
		const html = renderToStaticMarkup(
			<GeographyUsage
				rows={[
					{
						countryCode: "GB",
						requests: 1200,
						tokens: 85000,
						spendNanos: 1250000000,
						successes: 1140,
						averageLatencyMs: 245.4,
					},
				]}
			/>,
		);

		expect(html).toContain("md:hidden");
		expect(html).toContain("md:block");
		expect(html).toContain("Average latency");
		expect(html).toContain("Share");
		expect(html).toContain("100.0%");
		expect(html).toContain("95.0%");
		expect(html).toContain("0.25 s");
		expect(html).toContain("$1.25");
		expect(html).not.toContain("US$1.25");
		expect(html).toContain("/flags/gb.svg");
		expect(html).toContain("h-6 w-8");
		expect(html).not.toContain("bg-primary/5");
	});

	it("uses the Settings empty-state pattern", () => {
		const html = renderToStaticMarkup(<GeographyUsage rows={[]} />);

		expect(html).toContain("border-dashed");
		expect(html).toContain("No geographic usage yet");
		expect(html).toContain("selected period");
	});
});
