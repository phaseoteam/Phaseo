import { renderToStaticMarkup } from "react-dom/server";
import { EpochLogo } from "@/components/EpochLogo";
import { benchmarkSearchAliases, isEpochSearchResult, isExactBenchmarkAlias } from "./Search.benchmarks";

it.each(["/benchmarks/epoch-capabilities-index", "/fr-FR/benchmarks/epoch-capabilities-index?eciView=range"])("recognises the ECI dashboard at %s", (href) => {
	expect(isEpochSearchResult(href)).toBe(true);
	expect(benchmarkSearchAliases(href)).toEqual(expect.arrayContaining(["ECI", "Epoch AI", "Epoch Capabilities Index"]));
});
it.each(["/benchmarks/epoch-capabilities-index-other", "/benchmarks/artificial-analysis", "/models/epoch"])("does not apply ECI branding to %s", (href) => {
	expect(isEpochSearchResult(href)).toBe(false);
	expect(benchmarkSearchAliases(href)).toEqual([]);
});
it("uses the real Epoch artwork with a symbol-only viewport", () => {
	const html = renderToStaticMarkup(<EpochLogo />);
	expect(html).toContain('href="/benchmarks/epoch-ai.svg"');
	expect(html).toContain('viewBox="0 0 28 28"');
});

it("prioritises exact benchmark aliases without boosting incidental substrings", () => {
	expect(isExactBenchmarkAlias("/benchmarks/epoch-capabilities-index", " ECI ")).toBe(true);
	expect(isExactBenchmarkAlias("/benchmarks/epoch-capabilities-index", "epoch ai")).toBe(true);
	expect(isExactBenchmarkAlias("/benchmarks/epoch-capabilities-index", "ci")).toBe(false);
	expect(isExactBenchmarkAlias("/models/decision", "ECI")).toBe(false);
});
