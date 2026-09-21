"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { DisplayNumber } from "@/components/display/DisplayValue";

type BreakdownRow = {
	id: string;
	label: string;
	subtitle?: string | null;
	spendUsd: number;
	requests: number;
	tokens: number;
	avgLatencyMs: number | null;
};

type TopModelsProps = {
	rows: BreakdownRow[];
	variant?: "model" | "key";
};

const VARIANT_META: Record<
	Required<TopModelsProps>["variant"],
	{ title: string; column: string }
> = {
	model: { title: "Top Models (by spend)", column: "Model" },
	key: { title: "Top API Keys (by spend)", column: "API Key" },
};

export default function TopModels({
	rows,
	variant = "model",
}: TopModelsProps) {
	const meta = VARIANT_META[variant];

	return (
		<Card>
			<CardHeader>
				<CardTitle>{meta.title}</CardTitle>
			</CardHeader>
			<CardContent>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{meta.column}</TableHead>
							<TableHead className="text-right">Spend</TableHead>
							<TableHead className="text-right">
								Requests
							</TableHead>
							<TableHead className="text-right">Tokens</TableHead>
							<TableHead className="text-right">
								Avg Latency (ms)
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((row) => (
							<TableRow key={row.id}>
								<TableCell className="font-medium">
									<div className="flex flex-col">
										<span>{row.label}</span>
										{row.subtitle ? (
											<span className="text-xs text-muted-foreground">
												{row.subtitle}
											</span>
										) : null}
									</div>
								</TableCell>
								<TableCell className="text-right">
									${row.spendUsd.toFixed(5)}
								</TableCell>
								<TableCell className="text-right">
									<DisplayNumber value={row.requests} />
								</TableCell>
								<TableCell className="text-right">
									<DisplayNumber value={row.tokens} />
								</TableCell>
								<TableCell className="text-right">
									{row.avgLatencyMs != null
										? Math.round(row.avgLatencyMs)
										: "-"}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</CardContent>
		</Card>
	);
}
