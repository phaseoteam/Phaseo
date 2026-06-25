import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { Calendar } from "./calendar";

describe("Calendar", () => {
	it("applies month grid styling for react-day-picker v10", () => {
		const html = renderToStaticMarkup(
			<Calendar
				mode="range"
				numberOfMonths={2}
				selected={{
					from: new Date(2026, 4, 10),
					to: new Date(2026, 4, 18),
				}}
				defaultMonth={new Date(2026, 4, 1)}
			/>,
		);

		const monthGridClasses = Array.from(
			html.matchAll(/class="([^"]*\brdp-month_grid\b[^"]*)"/g),
			(match) => match[1],
		);

		expect(monthGridClasses).toHaveLength(2);
		expect(monthGridClasses).toEqual(
			expect.arrayContaining([
				expect.stringContaining("w-full"),
				expect.stringContaining("border-collapse"),
			]),
		);
	});
});
