"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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
import { qParser } from "@/app/(dashboard)/models/search-params";

interface ModelsDisplayProps {
	models: ModelCard[];
}

export default function ModelsDisplay({
	models,
}: ModelsDisplayProps) {
	const [search, setSearch] = useQueryState("q", qParser);
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const isTable = pathname?.includes("/models/table");
	const isCollections = pathname?.includes("/models/collections");

	const buildHref = (path: string, options?: { toTable?: boolean }) => {
		const params = new URLSearchParams(searchParams?.toString() ?? "");
		if (options?.toTable) {
			const qValue = params.get("q") ?? search ?? "";
			if (qValue.trim()) {
				params.set("search", qValue);
			} else {
				params.delete("search");
			}
		}
		const qs = params.toString();
		return qs ? `${path}?${qs}` : path;
	};

	return (
		<>
			<div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-2">
				<div className="flex items-center w-full md:w-auto">
					<h1 className="font-bold text-xl mb-2 md:mb-0">Models</h1>

					<div className="ml-2 md:hidden">
						<div className="inline-flex rounded-md overflow-hidden border bg-background">
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="sm"
										asChild
										variant={!isTable ? "default" : "outline"}
										className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
									>
										<Link
											href={buildHref("/models")}
											prefetch={false}
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
										variant={isTable ? "default" : "outline"}
										className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
										asChild
									>
										<Link
											href={buildHref("/models/table", {
												toTable: true,
											})}
											prefetch={false}
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
										variant={isCollections ? "default" : "outline"}
										className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
										asChild
									>
										<Link
											href={buildHref("/models/collections")}
											prefetch={false}
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
				<div className="hidden md:flex items-center">
					<div className="inline-flex rounded-md overflow-hidden border bg-background">
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									size="sm"
									asChild
									variant={!isTable ? "default" : "outline"}
									className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
								>
									<Link
										href={buildHref("/models")}
										prefetch={false}
										aria-label="Card view"
									>
										<GridIcon className="h-4 w-4" />
									</Link>
								</Button>
							</TooltipTrigger>
							<TooltipContent side="top">Card view</TooltipContent>
						</Tooltip>

						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									size="sm"
									variant={isTable ? "default" : "outline"}
									className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
									asChild
								>
									<Link
										href={buildHref("/models/table", {
											toTable: true,
										})}
										prefetch={false}
										aria-label="Table view"
									>
										<TableIcon className="h-4 w-4" />
									</Link>
								</Button>
							</TooltipTrigger>
							<TooltipContent side="top">Table view</TooltipContent>
						</Tooltip>

						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									size="sm"
									variant={isCollections ? "default" : "outline"}
									className="px-3 py-1 text-xs whitespace-nowrap rounded-none"
									asChild
								>
									<Link
										href={buildHref("/models/collections")}
										prefetch={false}
										aria-label="Collections view"
									>
										<LayersIcon className="h-4 w-4" />
									</Link>
								</Button>
							</TooltipTrigger>
							<TooltipContent side="top">Collections</TooltipContent>
						</Tooltip>
					</div>
				</div>
			</div>

			<ModelsGrid filteredModels={models} />
		</>
	);
}
