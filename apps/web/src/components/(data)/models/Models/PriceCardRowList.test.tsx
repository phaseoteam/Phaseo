import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PriceCardRowList } from "./PriceCardRowList";

describe("PriceCardRowList", () => {
	it("keeps each price on one line and puts the merged modalities under the label", () => {
		const html = renderToStaticMarkup(
			<PriceCardRowList
				rows={[
					{ key: "input", label: "Input", note: null, value: "$2" },
					{ key: "cached", label: "Cached input", note: "Also image, video and audio", value: "$0.10" },
				]}
			/>,
		);
		const values = html.match(/<dd class="([^"]*)">([^<]*)<\/dd>/g) ?? [];
		expect(values).toHaveLength(2);
		for (const value of values) {
			expect(value).toContain("whitespace-nowrap");
			expect(value).toContain("tabular-nums");
			expect(value).toContain("text-right");
		}
		expect(html).toContain(">$0.10</dd>");
		expect(html).toContain("Also image, video and audio");
	});

	it("renders nothing without rows", () => {
		expect(renderToStaticMarkup(<PriceCardRowList rows={[]} />)).toBe("");
	});
});
