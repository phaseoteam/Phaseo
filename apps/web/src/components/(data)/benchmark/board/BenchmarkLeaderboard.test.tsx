import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { BoardRow } from "@/lib/benchmarks/boardResults";
import { BenchmarkLeaderboard } from "./BenchmarkLeaderboard";

vi.mock("nuqs", () => ({ useQueryState: () => ["", vi.fn()] }));
vi.mock("@/i18n/react", () => ({ useTranslations: () => (key: string) => key, useLocale: () => "en-GB" }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => <a href={href} className={className}>{children}</a> }));
vi.mock("@/components/Logo", () => ({ Logo: () => null }));

function row(overrides: Partial<BoardRow>): BoardRow {
	return {
		id: "r1", modelId: "lab/model", modelName: "Model", organisationId: "lab", organisationName: "Lab", organisationColour: null,
		releaseDate: null, score: 80, selfReported: false, sourceId: null, effort: null, harness: null, config: null, variant: null,
		ciLow: null, ciHigh: null, costUsd: null, durationSeconds: null, outputTokens: null, observedOn: null, link: null, note: null,
		...overrides,
	};
}

describe("BenchmarkLeaderboard", () => {
	it("shows a result's evaluation note as a clamped button that expands", () => {
		const html = renderToStaticMarkup(
			<BenchmarkLeaderboard rows={[row({ note: "5-shot, chain of thought" })]} scale={{ unit: "%", type: "percentage", higherIsBetter: true }} />,
		);
		expect(html).toContain("5-shot, chain of thought");
		expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*line-clamp-2[^>]*>5-shot, chain of thought<\/button>/);
	});

	it("renders no note button when a result has no note", () => {
		const html = renderToStaticMarkup(
			<BenchmarkLeaderboard rows={[row({})]} scale={{ unit: "%", type: "percentage", higherIsBetter: true }} />,
		);
		expect(html).not.toContain("line-clamp-2");
	});
});
