/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AppIntlProvider } from "@/i18n/react";
import { englishCatalogueMessages, englishCommonMessages } from "@/i18n/default-messages";
import { HoverCard, HoverCardTrigger } from "@/components/ui/hover-card";
import { BenchmarkScoreHoverCardContent, formatBenchmarkScoreDelta } from "./BenchmarkScoreHoverCard";
import { IntelligenceValueHoverCard } from "@/components/(rankings)/IntelligenceValueHoverCard";

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
	vi.useFakeTimers();
	Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
});

afterEach(() => {
	act(() => root.unmount());
	container.remove();
	vi.useRealTimers();
});

async function open(content: ReactNode) {
	act(() => root.render(
		<AppIntlProvider timeZone="UTC" locale="en-GB" messages={{ Catalogue: englishCatalogueMessages, Common: englishCommonMessages }}>
			<HoverCard>
				<HoverCardTrigger asChild><button type="button">bar</button></HoverCardTrigger>
				{content}
			</HoverCard>
		</AppIntlProvider>,
	));
	await act(async () => { container.querySelector("button")!.focus(); });
	await act(async () => { await vi.runAllTimersAsync(); });
	return document.body.querySelector<HTMLElement>("[data-slot=hover-card-content]")!;
}

const rows = (card: HTMLElement) =>
	Array.from(card.querySelectorAll("dt")).map((dt) => `${dt.textContent}=${dt.nextElementSibling?.textContent}`);

it("signs the gap to this model, in dollars for cost benchmarks", () => {
	expect(formatBenchmarkScoreDelta("aa-intelligence-index-v4", 62.4, 58.2, "en-GB")).toBe("+4.2");
	expect(formatBenchmarkScoreDelta("aa-intelligence-index-v4", 50, 58.2, "en-GB")).toBe("-8.2");
	expect(formatBenchmarkScoreDelta("aa-intelligence-index-cost-v4", 120.5, 121.7, "de-DE")).toBe("-$1.20");
	expect(formatBenchmarkScoreDelta("aa-intelligence-index-v4", 58.2, 58.2, "en-GB")).toBe("0");
	expect(formatBenchmarkScoreDelta("aa-intelligence-index-v4", 58.2, null, "en-GB")).toBeNull();
});

it("shows the score as the headline, then configuration, rank and the gap", async () => {
	const card = await open(
		<BenchmarkScoreHoverCardContent
			modelId="openai/gpt-test"
			modelName="GPT Test"
			logoId="openai"
			meta={["OpenAI", "10 Nov 2026"]}
			score="62.4"
			rows={[
				{ key: "configuration", label: "Configuration", value: "High" },
				{ key: "rank", label: "Rank", value: "#3 of 40" },
				{ key: "vs", label: "vs this model", value: "+4.2" },
			]}
		/>,
	);
	expect(card.querySelector("[data-slot=hover-card-header] a")?.getAttribute("href")).toContain("/models/openai/gpt-test");
	expect(card.querySelector("[data-slot=hover-card-meta]")?.textContent).toBe("OpenAI · 10 Nov 2026");
	expect(card.querySelector("[data-slot=hover-card-stat]")?.textContent).toBe("62.4");
	expect(rows(card)).toEqual(["Configuration=High", "Rank=#3 of 40", "vs this model=+4.2"]);
});

it("gives the value chart the same card, with cost per point as the headline", async () => {
	const card = await open(
		<IntelligenceValueHoverCard
			total={40}
			entry={{ model_id: "google/gem", model_name: "Gem", score: 2.5, rank: 4, intelligence_score: 50, evaluation_cost: 125, organisation_id: "google", organisation_name: "Google", organisation_colour: null }}
		/>,
	);
	expect(card.querySelector("[data-slot=hover-card-stat]")?.textContent).toBe("$2.50 / point");
	expect(rows(card)).toEqual(["Configuration=Default", "Rank=#4 of 40", "Intelligence=50", "Evaluation cost=$125.00"]);
});
