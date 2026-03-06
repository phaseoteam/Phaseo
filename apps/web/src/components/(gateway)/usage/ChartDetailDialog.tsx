"use client";

import React from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Download } from "lucide-react";
import { exportToCSV, exportToPDF } from "./export-utils";

interface ChartDetailDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	bucket: string | null;
	breakdown: Record<string, { requests: number; tokens: number; cost: number }> | null;
	metric: "requests" | "tokens" | "cost";
}

type BreakdownRow = {
	model: string;
	requests: number;
	tokens: number;
	cost: number;
};

export default function ChartDetailDialog({
	open,
	onOpenChange,
	bucket,
	breakdown,
	metric,
}: ChartDetailDialogProps) {
	if (!breakdown || !bucket) return null;

	const rows = React.useMemo(() => {
		return Object.entries(breakdown)
			.map(([modelId, data]) => ({
				model: modelId,
				requests: data.requests,
				tokens: data.tokens,
				cost: data.cost,
			}))
			.sort((a, b) => {
				if (metric === "requests") return b.requests - a.requests;
				if (metric === "tokens") return b.tokens - a.tokens;
				return b.cost - a.cost;
			});
	}, [breakdown, metric]);

	const totals = React.useMemo(
		() =>
			rows.reduce(
				(acc, row) => ({
					requests: acc.requests + row.requests,
					tokens: acc.tokens + row.tokens,
					cost: acc.cost + row.cost,
				}),
				{ requests: 0, tokens: 0, cost: 0 },
			),
		[rows],
	);

	const handleExport = (format: "csv" | "pdf") => {
		const exportRows = rows.map((row) => ({
			Model: row.model,
			Requests: row.requests,
			Tokens: row.tokens,
			Cost: `$${row.cost.toFixed(5)}`,
		}));

		const timestamp = new Date().toISOString().split("T")[0];
		const filename = `chart-breakdown-${bucket}-${timestamp}`;
		const title = `Chart Breakdown - ${bucket}`;

		if (format === "csv") {
			exportToCSV(exportRows, filename);
		} else {
			exportToPDF(exportRows, filename, title);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-3xl">
				<DialogHeader>
					<DialogTitle>Breakdown for {bucket}</DialogTitle>
				</DialogHeader>

				<div className="space-y-4">
					<div className="flex justify-end gap-2">
						<Button variant="outline" size="sm" onClick={() => handleExport("csv")}>
							<Download className="mr-2 h-4 w-4" />
							Export CSV
						</Button>
						<Button variant="outline" size="sm" onClick={() => handleExport("pdf")}>
							<Download className="mr-2 h-4 w-4" />
							Export PDF
						</Button>
					</div>

					<div className="rounded-md border max-h-[400px] overflow-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Model</TableHead>
									<TableHead className="text-right">Requests</TableHead>
									<TableHead className="text-right">Tokens</TableHead>
									<TableHead className="text-right">Cost</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((row) => (
									<TableRow key={row.model}>
										<TableCell className="font-medium">{row.model}</TableCell>
										<TableCell className="text-right font-mono">
											{row.requests.toLocaleString()}
										</TableCell>
										<TableCell className="text-right font-mono">
											{row.tokens.toLocaleString()}
										</TableCell>
										<TableCell className="text-right font-mono">${row.cost.toFixed(5)}</TableCell>
									</TableRow>
								))}
								<TableRow className="bg-muted font-semibold">
									<TableCell>Total</TableCell>
									<TableCell className="text-right font-mono">
										{totals.requests.toLocaleString()}
									</TableCell>
									<TableCell className="text-right font-mono">
										{totals.tokens.toLocaleString()}
									</TableCell>
									<TableCell className="text-right font-mono">
										${totals.cost.toFixed(5)}
									</TableCell>
								</TableRow>
							</TableBody>
						</Table>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
