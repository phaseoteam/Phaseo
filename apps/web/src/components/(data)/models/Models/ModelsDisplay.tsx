"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { debounce, useQueryState } from "nuqs";
import { ModelsGrid } from "./ModelsGrid";
import { Input } from "@/components/ui/input";
import {
	Search,
	Grid as GridIcon,
	Table as TableIcon,
	Layers as LayersIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipTrigger,
	TooltipContent,
} from "@/components/ui/tooltip";
import { ModelCard } from "@/lib/fetchers/models/getAllModels";
import { qParser, yearParser } from "@/app/(dashboard)/models/search-params";
import { UPCOMING_TAB_VALUE, UNKNOWN_TAB_VALUE } from "@/lib/models/modelTabs";

interface ModelsDisplayProps {
	models: ModelCard[];
	years: number[];
	activeYear: number | null;
	hasUpcoming: boolean;
	hasUnknown: boolean;
}

export default function ModelsDisplay({
	models,
	years,
	activeYear,
	hasUpcoming,
	hasUnknown,
}: ModelsDisplayProps) {
	const [search, setSearch] = useQueryState("q", qParser);
	const [, setYear] = useQueryState("year", yearParser);
	const pathname = usePathname();
	const isTable = pathname?.includes("/models/table");
	const isCollections = pathname?.includes("/models/collections");

	return (
		<>
			<div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-2">
				<div className="flex items-center w-full md:w-auto">
					<h1 className="font-bold text-xl mb-2 md:mb-0">Models</h1>

					{/* Mobile: tabs next to the title (align with the Models text) */}
					<div className="ml-2 md:hidden">
						<div className="inline-flex rounded-md overflow-hidden border bg-background">
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="sm"
										asChild
										variant={
											!isTable ? "default" : "outline"
										}
										className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
									>
										<Link
											href="/models"
											aria-label="Card view"
										>
											<GridIcon className="h-4 w-4" />
										</Link>
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top">
									Card view
								</TooltipContent>
							</Tooltip>

							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="sm"
										variant={
											isTable ? "default" : "outline"
										}
										className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
										asChild
									>
										<Link
											href="/models/table"
											aria-label="Table view"
										>
											<TableIcon className="h-4 w-4" />
										</Link>
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top">
									Table view
								</TooltipContent>
							</Tooltip>

							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="sm"
										variant={
											isCollections
												? "default"
												: "outline"
										}
										className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
										asChild
									>
										<Link
											href="/models/collections"
											aria-label="Collections view"
										>
											<LayersIcon className="h-4 w-4" />
										</Link>
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top">
									Collections
								</TooltipContent>
							</Tooltip>
						</div>
					</div>
				</div>

				<div className="relative w-full md:w-1/5">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
					<Input
						placeholder="Search models..."
						value={search}
						onChange={(e) =>
							setSearch(e.target.value || null, {
								limitUrlUpdates: debounce(250),
							})
						}
						className="pl-9 pr-2 py-1.5 text-sm rounded-full bg-background border focus:outline-hidden focus:ring-2 focus:ring-primary w-full"
						style={{ minWidth: 0 }}
					/>
				</div>
			</div>

			{/* Years row with desktop-only tabs right-aligned */}
			<div className="mb-4 -mx-1 overflow-x-auto">
				<div className="flex items-center justify-between px-1 pb-1 gap-2">
					<div className="flex gap-2">
						{hasUpcoming ? (
							<Button
								key="upcoming"
								size="sm"
								variant={
									activeYear === UPCOMING_TAB_VALUE
										? "default"
										: "outline"
								}
								onClick={() => setYear(UPCOMING_TAB_VALUE)}
								className="px-3 py-1 text-xs whitespace-nowrap rounded-full"
							>
								Upcoming
							</Button>
						) : null}
						{years.length > 0 &&
							years.map((year) => (
								<Button
									key={year}
									size="sm"
									variant={
										activeYear === year
											? "default"
											: "outline"
									}
									onClick={() => setYear(year)}
									className="px-3 py-1 text-xs whitespace-nowrap rounded-full"
								>
									{year}
								</Button>
							))}
						{hasUnknown ? (
							<Button
								key="unknown"
								size="sm"
								variant={
									activeYear === UNKNOWN_TAB_VALUE
										? "default"
										: "outline"
								}
								onClick={() => setYear(UNKNOWN_TAB_VALUE)}
								className="px-3 py-1 text-xs whitespace-nowrap rounded-full"
							>
								Unknown
							</Button>
						) : null}
					</div>

					{/* Desktop tabs aligned to the right of the years row */}
					<div className="hidden md:flex items-center">
						<div className="inline-flex rounded-md overflow-hidden border bg-background">
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="sm"
										asChild
										variant={
											!isTable ? "default" : "outline"
										}
										className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
									>
										<Link
											href="/models"
											aria-label="Card view"
										>
											<GridIcon className="h-4 w-4" />
										</Link>
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top">
									Card view
								</TooltipContent>
							</Tooltip>

							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="sm"
										variant={
											isTable ? "default" : "outline"
										}
										className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
										asChild
									>
										<Link
											href="/models/table"
											aria-label="Table view"
										>
											<TableIcon className="h-4 w-4" />
										</Link>
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top">
									Table view
								</TooltipContent>
							</Tooltip>

							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="sm"
										variant={
											isCollections
												? "default"
												: "outline"
										}
										className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
										asChild
									>
										<Link
											href="/models/collections"
											aria-label="Collections view"
										>
											<LayersIcon className="h-4 w-4" />
										</Link>
									</Button>
								</TooltipTrigger>
								<TooltipContent side="top">
									Collections
								</TooltipContent>
							</Tooltip>
						</div>
					</div>
				</div>
			</div>

			<ModelsGrid filteredModels={models} />
		</>
	);
}
