import { renderToStaticMarkup } from "react-dom/server";
import { IntelligenceValueBars } from "./IntelligenceValueBars";
import type { PublicIntelligenceValueEntry } from "@/lib/fetchers/frontend/fetchPublicCatalog";

it("orders cost-per-point bars best to worst with exact units and lab colours", () => {
	const entry = (model_name: string, score: number): PublicIntelligenceValueEntry => ({ model_id: model_name, model_name, score, rank: 1, intelligence_score: 50, evaluation_cost: score * 50, organisation_id: "google", organisation_name: "Google", organisation_colour: "#4285F4" });
	const html = renderToStaticMarkup(<IntelligenceValueBars entries={[entry("Expensive", 10), entry("Affordable", 2)]} />);
	expect(html.indexOf('aria-label="Affordable: $2')).toBeLessThan(html.indexOf('aria-label="Expensive: $10'));
	expect(html).toContain("per intelligence point");
	expect(html).toContain("background-color:#4285F4");
	expect(html).toContain("height:41px");
	expect(html).toContain("height:205px");
});
