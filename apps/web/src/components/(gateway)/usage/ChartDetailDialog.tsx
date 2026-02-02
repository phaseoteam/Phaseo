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

export default function ChartDetailDialog({
	open,
	onOpenChange,
	bucket,
	breakdown,
	metric,
}: ChartDetailDialogProps) {
	if (!breakdown || !bucket) return null;

	// Convert breakdown to array and sort by metric
	const rows = Object.entries(breakdown)
		.map(([modelId, data]) => ({
			Model: modelId,
			Requests: data.requests,
			Tokens: data.tokens,
			Cost: `$${data.cost.toFixed(5)}`,
		}))
		.sort((a, b) => {
			if (metric === "requests") return b.Requests - a.Requests;
			if (metric === "tokens") return b.Tokens - a.Tokens;
			// cost
			return parseFloat(b.Cost.slice(1)) - parseFloat(a.Cost.slice(1));
		});

	const handleExport = (format: "csv" | "pdf") => {
		const timestamp = new Date().toISOString().split("T")[0];
		const filename = `chart-breakdown-${bucket}-${timestamp}`;
		const title = `Chart Breakdown - ${bucket}`;

		if (format === "csv") {
			exportToCSV(rows, filename);
		} else {
			exportToPDF(rows, filename, title);
		}
	};

	const totals = rows.reduce(
		(acc, row) => ({
			requests: acc.requests + row.Requests,
			tokens: acc.tokens + row.Tokens,
			cost: acc.cost + parseFloat(row.Cost.slice(1)),
		}),
		{ requests: 0, tokens: 0, cost: 0 }
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-3xl">
				<DialogHeader>
					<DialogTitle>Breakdown for {bucket}</DialogTitle>
				</DialogHeader>

				<div className="space-y-4">
					{/* Export Buttons */}
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

					{/* Breakdown Table */}
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
								{rows.map((row, idx) => (
									<TableRow key={idx}>
										<TableCell className="font-medium">{row.Model}</TableCell>
										<TableCell className="text-right font-mono">
											{row.Requests.toLocaleString()}
										</TableCell>
										<TableCell className="text-right font-mono">
											{row.Tokens.toLocaleString()}
										</TableCell>
										<TableCell className="text-right font-mono">{row.Cost}</TableCell>
									</TableRow>
								))}
								{/* Totals Row */}
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
