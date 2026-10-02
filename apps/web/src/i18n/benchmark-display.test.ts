import fs from "node:fs";
import path from "node:path";
import { artificialAnalysisMetrics, formatArtificialAnalysisScore } from "@/lib/benchmarks/artificialAnalysis";
import { ARTIFICIAL_ANALYSIS_METRIC_KEYS, BENCHMARK_CONFIGURATION_KEYS, localizedArtificialAnalysisMetric, localizedBenchmarkConfiguration } from "./benchmark-display";
import { formatBenchmarkScore } from "@/lib/benchmarks/scoreFormat";

describe("localized benchmark display", () => {
	it("covers canonical metric definitions", () => {
		expect(artificialAnalysisMetrics.map((metric) => metric.key).sort()).toEqual([...ARTIFICIAL_ANALYSIS_METRIC_KEYS].sort());
	});
	it.each(["en-GB", "es-ES", "fr-FR", "de-DE", "pt-BR", "ja", "zh-Hans", "hi", "ar-SA"])("resolves configurations and metrics in %s", (locale) => {
		const catalogs = Object.fromEntries([["Common", "common"], ["Catalogue", "catalogue"]].map(([namespace, file]) => [namespace, JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "messages", locale, file + ".json"), "utf8"))]));
		const t = (key: never): string => {
			const value = (key as string).split(".").reduce<unknown>((current, segment) => current && typeof current === "object" ? (current as Record<string, unknown>)[segment] : undefined, catalogs);
			expect(typeof value).toBe("string");
			return value as string;
		};
		for (const code of Object.keys(BENCHMARK_CONFIGURATION_KEYS)) expect(localizedBenchmarkConfiguration(code, t)).toBeTruthy();
		for (const metric of artificialAnalysisMetrics) {
			const display = localizedArtificialAnalysisMetric(metric, t);
			expect(display.id).toBe(metric.id);
			expect(display.key).toBe(metric.key);
			expect(display.label).toBeTruthy();
			expect(display.description).toBeTruthy();
		}
		expect(localizedBenchmarkConfiguration("custom-code", t)).toBe("custom-code");
	});
	it("formats scores using the selected locale without changing source values", () => {
		expect(formatArtificialAnalysisScore("aa-intelligence-index-v4", 12.34, "de-DE")).toBe("12,34");
		expect(formatBenchmarkScore({ value: 0.1234, isPercentage: true, locale: "de-DE" })).toBe("12,34 %");
	});
});
