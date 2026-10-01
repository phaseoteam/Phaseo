import Link from "next/link";
import type { PublicIntelligenceValueEntry } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { artificialAnalysisValueKey, artificialAnalysisValueLabel, formatArtificialAnalysisScore, formatArtificialAnalysisValue } from "@/lib/benchmarks/artificialAnalysis";

export function IntelligenceValueTable({ entries }: { entries: PublicIntelligenceValueEntry[] }) {
	return <div className="overflow-x-auto">
		<table className="w-full text-left text-sm">
			<caption className="sr-only">Evaluation cost per intelligence point, ranked from lowest cost. Scores and costs use the same evaluated configuration.</caption>
			<thead className="border-b bg-muted/30 text-xs text-muted-foreground">
				<tr>
					<th scope="col" className="px-5 py-3">Rank</th>
					<th scope="col" className="px-3 py-3">Model / configuration</th>
					<th scope="col" className="px-3 py-3 text-right">Intelligence</th>
					<th scope="col" className="px-3 py-3 text-right">Eval cost</th>
					<th scope="col" className="px-5 py-3 text-right">USD / point</th>
				</tr>
			</thead>
			<tbody className="divide-y">
				{entries.map((entry) => <tr key={artificialAnalysisValueKey(entry)}>
					<td className="px-5 py-4 tabular-nums text-muted-foreground">{entry.rank}</td>
					<th scope="row" className="min-w-52 px-3 py-4 font-normal">
						<Link href={`/models/${entry.model_id}`} className="font-medium hover:underline">{entry.model_name}</Link>
						<p className="mt-1 text-xs text-muted-foreground">{artificialAnalysisValueLabel(entry)}</p>
					</th>
					<td className="px-3 py-4 text-right tabular-nums">{entry.intelligence_score}</td>
					<td className="px-3 py-4 text-right tabular-nums">{formatArtificialAnalysisScore("aa-intelligence-index-cost-v4", entry.evaluation_cost)}</td>
					<td className="px-5 py-4 text-right font-semibold tabular-nums" title={String(entry.score)}>{formatArtificialAnalysisValue(entry.score)}</td>
				</tr>)}
			</tbody>
		</table>
	</div>;
}
