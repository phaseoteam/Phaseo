"use client";

import React from "react";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";
import { formatErrorListSummary } from "@/lib/gateway/usage/errorListSummary";

export type ErrorRow = {
	request_id?: string | null;
	created_at: string;
	provider?: string | null;
	model_id?: string | null;
	status_code?: number | null;
	error_code?: string | null;
	error_message?: string | null;
	error_payload?: Record<string, unknown> | null;
	usage?: any;
	cost_nanos?: number | null;
};

function niceDate(iso: string) {
	try {
		return new Date(iso).toLocaleString();
	} catch {
		return iso;
	}
}

export default function ErrorsTable({
	rows,
	onSelect,
}: {
	rows: ErrorRow[];
	onSelect: (row: ErrorRow) => void;
}) {
	return (
		<div className="overflow-auto">
			<Table>
				<TableHeader>
					<TableRow className="h-8">
						<TableHead className="py-1">Time</TableHead>
						<TableHead className="py-1">Model</TableHead>
						<TableHead className="py-1">Status</TableHead>
						<TableHead className="w-[40px] py-1" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map((r, idx) => {
						const summary = formatErrorListSummary(r);
						return (
						<TableRow key={idx} className="h-8">
							<TableCell className="py-1 align-middle">
								{niceDate(r.created_at)}
							</TableCell>
							<TableCell className="py-1 align-middle">
								<div className="space-y-1">
									<div>{r.model_id ?? "-"}</div>
									{summary ? (
										<div className="text-xs text-rose-700 line-clamp-2">
											{summary}
										</div>
									) : null}
								</div>
							</TableCell>
							<TableCell className="py-1 align-middle">
								<span className="font-mono text-xs">
									{r.status_code ?? "-"}
									{/* {r.error_code ? ` · ${r.error_code}` : ""} */}
								</span>
							</TableCell>
							<TableCell className="py-1 align-middle">
								<Button
									variant="ghost"
									size="icon"
									onClick={() => onSelect(r)}
									aria-label="View details"
								>
									<ChevronRight className="h-4 w-4" />
								</Button>
							</TableCell>
						</TableRow>
						);
					})}
				</TableBody>
			</Table>
		</div>
	);
}
