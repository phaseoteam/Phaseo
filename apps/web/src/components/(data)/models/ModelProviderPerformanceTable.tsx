"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
	type ColumnDef,
	getCoreRowModel,
	getSortedRowModel,
	type SortingState,
	useReactTable,
	flexRender,
} from "@tanstack/react-table";
import { ArrowUpDown } from "lucide-react";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { ModelProviderPerformance } from "@/lib/fetchers/models/getModelPerformance";
import { cn } from "@/lib/utils";

function formatMetric(
	value: number | null,
	suffix: string,
	decimals = 0
): string {
	if (value == null) return "--";
	return `${value.toFixed(decimals)}${suffix}`;
}

function getUptimeColorClass(value: number | null): string {
	if (value == null) return "bg-border/70 dark:bg-border/50";
	if (value >= 90) return "bg-emerald-500";
	if (value >= 75) return "bg-amber-500";
	return "bg-rose-500";
}

function formatRangeLabel(start: string, end: string): string {
	const startDate = new Date(start);
	const endDate = new Date(end);
	if (
		!Number.isFinite(startDate.getTime()) ||
		!Number.isFinite(endDate.getTime())
	) {
		return `Requests from ${start} to ${end}`;
	}

	const startLabel = startDate.toLocaleString("en-US", {
		weekday: "short",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
	const endLabel = endDate.toLocaleString("en-US", {
		weekday: "short",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});

	return `Requests from ${startLabel} to ${endLabel}`;
}

interface ProviderTableProps {
	providers: ModelProviderPerformance[];
}

export default function ModelProviderPerformanceTable({
	providers,
}: ProviderTableProps) {
	const [sorting, setSorting] = useState<SortingState>([
		{ id: "avgThroughput", desc: true },
	]);

	const columns = useMemo<ColumnDef<ModelProviderPerformance>[]>(
		() => [
			{
				id: "provider",
				accessorKey: "providerName",
				header: ({ column }) => (
					<Button
						variant="ghost"
						className="px-0 font-semibold"
						onClick={() =>
							column.toggleSorting(column.getIsSorted() === "asc")
						}
					>
						Provider
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				),
				cell: ({ row }) => {
					const provider = row.original;
					return (
						<div className="flex items-center gap-3">
							<Link
								href={`/api-providers/${provider.provider}`}
								prefetch={false}
								className="inline-flex rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
							>
								<Logo
									id={provider.provider}
									alt={`${
										provider.providerName ||
										provider.provider
									} logo`}
									width={28}
									height={28}
									className="h-7 w-7 rounded"
								/>
							</Link>
							<Link
								href={`/api-providers/${provider.provider}`}
								prefetch={false}
								className="font-medium relative after:absolute after:-bottom-0.5 after:left-0 after:h-px after:w-0 after:bg-current after:transition-all after:duration-300 hover:after:w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-sm"
							>
								{provider.providerName || provider.provider}
							</Link>
						</div>
					);
				},
			},
			{
				accessorKey: "avgThroughput",
				header: ({ column }) => (
					<Button
						variant="ghost"
						className="px-0 font-semibold"
						onClick={() =>
							column.toggleSorting(column.getIsSorted() === "asc")
						}
					>
						Throughput
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				),
				cell: ({ row }) => (
					<span className="ml-3">
						{formatMetric(row.original.avgThroughput, " t/s", 2)}
					</span>
				),
			},
			{
				accessorKey: "avgLatencyMs",
				header: ({ column }) => (
					<Button
						variant="ghost"
						className="px-0 font-semibold"
						onClick={() =>
							column.toggleSorting(column.getIsSorted() === "asc")
						}
					>
						Latency
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				),
				cell: ({ row }) => (
					<span className="ml-3">
						{formatMetric(row.original.avgLatencyMs, " ms")}
					</span>
				),
			},
			{
				accessorKey: "avgGenerationMs",
				header: ({ column }) => (
					<Button
						variant="ghost"
						className="px-0 font-semibold"
						onClick={() =>
							column.toggleSorting(column.getIsSorted() === "asc")
						}
					>
						E2E Latency
						<ArrowUpDown className="ml-2 h-4 w-4" />
					</Button>
				),
				cell: ({ row }) => (
					<span className="ml-3">
						{formatMetric(row.original.avgGenerationMs, " ms")}
					</span>
				),
			},
			{
				id: "uptime",
				header: "Uptime",
				enableSorting: false,
				cell: ({ row }) => (
					<div className="flex items-center gap-4">
						<div className="flex flex-wrap items-center gap-1">
							{row.original.uptimeBuckets.map((bucket, index) => {
								const color = getUptimeColorClass(
									bucket.successPct
								);
								const label =
									bucket.successPct != null
										? `${bucket.successPct.toFixed(
												0
										  )}% success`
										: "No data";
								return (
									<div
										key={`${row.original.provider}-${bucket.start}-${index}`}
										className={`h-2.5 w-9 rounded-full transition-colors ${color}`}
										title={`${label} - ${formatRangeLabel(
											bucket.start,
											bucket.end
										)}`}
									>
										<span className="sr-only">
											{label} during{" "}
											{formatRangeLabel(
												bucket.start,
												bucket.end
											)}
										</span>
									</div>
								);
							})}
						</div>
						<span className="text-xs text-muted-foreground whitespace-nowrap">
							{row.original.uptimePct != null
								? `${row.original.uptimePct.toFixed(1)}%`
								: "--"}
						</span>
					</div>
				),
			},
		],
		[]
	);

	const table = useReactTable({
		data: providers,
		columns,
		state: {
			sorting,
		},
		onSortingChange: setSorting,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
	});

	if (!providers.length) {
		return (
			<div className="rounded-lg border border-dashed border-gray-300 bg-muted/20 p-6 text-center">
				<p className="text-sm font-semibold text-muted-foreground">
					No provider performance data available for the last 24
					hours.
				</p>
			</div>
		);
	}

	return (
		<div className="rounded-lg border border-gray-200 dark:border-gray-700 p-6">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div>
					<p className="text-xs uppercase tracking-wide text-muted-foreground">
						Provider performance
					</p>
					<h3 className="text-lg font-semibold text-foreground">
						Last 24 hours
					</h3>
				</div>
			</div>

			<div className="mt-4">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => {
									const meta =
										(header.column.columnDef.meta as
											| { headClassName?: string }
											| undefined) ?? {};
									return (
										<TableHead
											key={header.id}
											className={cn(meta.headClassName)}
										>
											{header.isPlaceholder
												? null
												: flexRender(
														header.column.columnDef
															.header,
														header.getContext()
												  )}
										</TableHead>
									);
								})}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{table.getRowModel().rows?.length ? (
							table.getRowModel().rows.map((row) => (
								<TableRow key={row.id}>
									{row.getVisibleCells().map((cell) => {
										const meta =
											(cell.column.columnDef.meta as
												| { cellClassName?: string }
												| undefined) ?? {};
										return (
											<TableCell
												key={cell.id}
												className={cn(meta.cellClassName)}
											>
												{flexRender(
													cell.column.columnDef.cell,
													cell.getContext()
												)}
											</TableCell>
										);
									})}
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell
									colSpan={columns.length}
									className="h-24 text-center"
								>
									No providers found.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
		</div>
	);
}
