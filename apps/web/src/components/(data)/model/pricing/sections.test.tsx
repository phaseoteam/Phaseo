import { renderToStaticMarkup } from "react-dom/server";
import { MeterRateRows } from "./sections";

describe("MeterRateRows", () => {
	it("shows meter names, prices, units and conditions without an extra section heading", () => {
		const html = renderToStaticMarkup(
			<MeterRateRows rows={[
				{
					meter: "audio_minutes",
					displayLabel: "Audio minutes",
					unit: "minute",
					unitQuantity: 1,
					unitLabel: "Per minute",
					price: 0.08,
				},
				{
					meter: "input_text_messages",
					unit: "message",
					unitQuantity: 1,
					unitLabel: "Per message",
					price: 0.004,
					conditions: [{ path: "request.quality", op: "eq", value: "high" }],
				},
			]} />,
		);

		expect(html).toContain("Audio minutes");
		expect(html).toContain("$0.08");
		expect(html).toContain("/ minute");
		expect(html).toContain("Input Text Messages");
		expect(html).toContain("$0.004");
		expect(html).toContain("quality: high");
		expect(html).not.toContain("Usage rates");
	});
});
