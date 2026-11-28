import { htmlText } from "../parse";
import type { BenchmarkSource, SourceObservation } from "../types";

/**
 * Company Agent Bench publishes its API-model results only in the cost chart, whose accessible label spells out every
 * model at every effort: "Opus 5.5: low 54.5% at $0.059 per question, medium …; Fable 5.2: …". Agent products (Dots,
 * Devin, …) are listed before the models as dashed reference lines; they are not models and are skipped.
 */
const PAGE = "https://companyagentbench.com";

/** Anthropic's models are written without the family. */
const withFamily = (name: string) => (/^(Fable|Opus|Sonnet|Haiku)\b/.test(name) ? `Claude ${name}` : name);

export function parseCompanyAgentBench(html: string): SourceObservation[] {
	const label = [...html.matchAll(/aria-label="([^"]*)"/g)].map((match) => htmlText(match[1])).find((text) => /^Accuracy across all \d+ questions against cost per question/.test(text));
	if (!label) throw new Error("Company Agent Bench format changed: cost chart label not found.");
	// Model entries start after the agent-product sentence.
	const models = label.replace(/^.*?agent products:.*?%\.\s/, "");
	if (models === label) throw new Error("Company Agent Bench format changed: agent-product sentence not found.");
	const observations: SourceObservation[] = [];
	for (const entry of models.split(";")) {
		const match = entry.trim().match(/^([^:]+):\s*(.+)$/);
		if (!match) continue;
		for (const point of match[2].matchAll(/(none|minimal|low|medium|high|xhigh|max)\s+([\d.]+)%\s+at\s+\$([\d.]+)\s+per question/gi)) {
			observations.push({ benchmarkId: "company-agent-bench", label: withFamily(match[1].trim()), effort: point[1].toLowerCase(), value: Number(point[2]), costUsd: Number(point[3]), harness: "Company Agent Bench Slack harness" });
		}
	}
	return observations;
}

export const companyAgentBench: BenchmarkSource = {
	id: "company-agent-bench",
	name: "Company Agent Bench",
	publisher: "Company Agent Bench (Phil Chen and Josh Qin)",
	url: PAGE,
	attribution: "Company Agent Bench (companyagentbench.com)",
	minRows: 14,
	benchmarks: [
		{ id: "company-agent-bench", name: "Company Agent Bench", url: PAGE, category: "agents", type: "percentage", unit: "%", higherIsBetter: true, description: "205 questions from a month of a real company's Slack, such as who wrote a message, who was tagged and who replied, answered by API models with the benchmark's Slack search and reading tools. Share answered correctly, with cost per question." },
	],
	async fetch(ctx) {
		return parseCompanyAgentBench(await ctx.fetchText(PAGE));
	},
};
