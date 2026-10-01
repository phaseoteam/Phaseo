"use client";

import { CartesianGrid, Cell, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import type { PublicIntelligenceValueEntry } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { artificialAnalysisChartColour, artificialAnalysisValueKey, artificialAnalysisValueLabel, formatArtificialAnalysisScore, formatArtificialAnalysisValue } from "@/lib/benchmarks/artificialAnalysis";

export default function IntelligenceValueScatter({ entries }: { entries: PublicIntelligenceValueEntry[] }) {
	return <figure className="border-b px-2 py-5 sm:px-5">
		<figcaption className="mb-4 px-3 text-xs text-muted-foreground">Intelligence vs evaluation cost · Lower and further right is better. Each point represents an evaluated configuration.</figcaption>
		<div className="h-80 w-full" role="img" aria-label="Scatter chart of intelligence score versus evaluation cost. Exact values are listed below.">
			<ResponsiveContainer width="100%" height="100%">
				<ScatterChart margin={{ top: 10, right: 20, bottom: 25, left: 15 }}>
					<CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
					<XAxis type="number" dataKey="intelligence_score" name="Intelligence" domain={[0, "auto"]} tick={{ fontSize: 11 }} label={{ value: "Intelligence score", position: "bottom", offset: 5 }} />
					<YAxis type="number" dataKey="evaluation_cost" name="Evaluation cost" domain={[0, "auto"]} tickFormatter={(value: number) => `$${value}`} tick={{ fontSize: 11 }} width={75} label={{ value: "Evaluation cost (USD)", angle: -90, position: "insideLeft", offset: -5, style: { textAnchor: "middle" } }} />
					<Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ active, payload }) => {
						const entry = payload?.[0]?.payload as PublicIntelligenceValueEntry | undefined;
						return active && entry ? <div className="max-w-72 rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-md">
							<p className="font-semibold">{entry.model_name}</p>
							{entry.organisation_name ? <p className="text-muted-foreground">{entry.organisation_name}</p> : null}
							<p className="mt-1 text-muted-foreground">{artificialAnalysisValueLabel(entry)}</p>
							<p className="mt-2">Intelligence: {entry.intelligence_score}</p>
							<p>Evaluation cost: {formatArtificialAnalysisScore("aa-intelligence-index-cost-v4", entry.evaluation_cost)}</p>
							<p className="mt-1 font-semibold">{formatArtificialAnalysisValue(entry.score)} / intelligence point</p>
						</div> : null;
					}} />
					<Scatter data={entries} fillOpacity={0.8} isAnimationActive={false}>
						{entries.map((entry) => <Cell key={artificialAnalysisValueKey(entry)} fill={artificialAnalysisChartColour(entry.organisation_id, entry.organisation_colour)} stroke="var(--foreground)" strokeOpacity={0.35} />)}
					</Scatter>
				</ScatterChart>
			</ResponsiveContainer>
		</div>
	</figure>;
}
