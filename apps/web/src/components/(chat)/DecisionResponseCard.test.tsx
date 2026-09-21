import { renderToStaticMarkup } from "react-dom/server";
import { DecisionResponseCard } from "./DecisionResponseCard";

describe("DecisionResponseCard", () => {
	it("renders a Noul answer once without a repeated summary and strip", () => {
		const html = renderToStaticMarkup(
			<DecisionResponseCard
				result={{
					answers: {
						decision: { type: "noul", noul: 0.71 },
					},
				}}
			/>,
		);

		expect(html).toContain("Yes");
		expect(html).toContain("71%");
		expect(html).toContain("No");
		expect(html).toContain("29%");
		expect(html).not.toContain("yes probability");
		expect(html).not.toContain('role="img"');
	});

	it("uses score names and explains the weighted average", () => {
		const html = renderToStaticMarkup(
			<DecisionResponseCard
				result={{
					answers: {
						decision: {
							type: "score",
							score: 0.21,
							confidence: 0.79,
							legend: {
								"0": "0 = No evidence",
								"1": "1 = Early signal",
								"2": "2 = Repeated evidence",
								"3": "3 = Strong evidence",
							},
							probabilities: { "0": 0.9, "1": 0.04, "2": 0.02, "3": 0.04 },
						},
					},
				}}
			/>,
		);

		expect(html).toContain("No evidence");
		expect(html).toContain("Early signal");
		expect(html).toContain("Repeated evidence");
		expect(html).toContain("Strong evidence");
		expect(html).toContain("Weighted average: 0.21 of 3");
		expect(html).not.toContain("0 = No evidence");
		expect(html).not.toContain("/ 3");
	});
});
