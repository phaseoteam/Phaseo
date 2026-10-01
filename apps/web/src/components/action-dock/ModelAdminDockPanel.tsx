"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, RefreshCw, Search } from "lucide-react";
import { searchAdminModelsForDockAction } from "@/app/(dashboard)/internal/data/modelAdminDockActions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

export function ModelAdminDockPanel({
	userId,
	onSelect,
}: {
	userId: string;
	onSelect: (modelId: string) => void;
}) {
	const [search, setSearch] = useState("");
	const normalizedSearch = search.trim();
	const [debouncedSearch, setDebouncedSearch] = useState("");

	useEffect(() => {
		const timeout = window.setTimeout(() => setDebouncedSearch(normalizedSearch), 250);
		return () => window.clearTimeout(timeout);
	}, [normalizedSearch]);

	const models = useQuery({
		queryKey: ["actionDockAdminModelSearch", userId, debouncedSearch],
		queryFn: () => searchAdminModelsForDockAction(debouncedSearch),
		enabled: debouncedSearch.length >= 2,
		staleTime: 30_000,
	});
	const isDebouncing = normalizedSearch.length >= 2 && normalizedSearch !== debouncedSearch;

	return (
		<div className="space-y-2 p-3">
			<div className="relative">
				<Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
				<Input
					autoFocus
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					placeholder="Search models by name or ID"
					aria-label="Search models by name or ID"
					className="h-9 rounded-lg bg-muted/30 pl-8 text-sm"
				/>
			</div>

			{normalizedSearch.length < 2 ? (
				<p className="px-1 py-5 text-center text-sm text-muted-foreground">Type at least 2 characters to search.</p>
			) : isDebouncing || models.isPending ? (
				<div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
					<LoaderCircle className="size-4 animate-spin" />Searching models…
				</div>
			) : models.isError ? (
				<div className="space-y-3 px-2 py-7 text-center">
					<p role="alert" className="text-sm text-destructive">Models could not be searched.</p>
					<Button type="button" variant="outline" size="sm" onClick={() => void models.refetch()} disabled={models.isFetching}>
						<RefreshCw className={models.isFetching ? "size-3.5 animate-spin" : "size-3.5"} />Try again
					</Button>
				</div>
			) : !models.data?.length ? (
				<p className="px-2 py-7 text-center text-sm text-muted-foreground">No models found.</p>
			) : (
				<ScrollArea className="max-h-72 rounded-lg border" viewportClassName="max-h-72">
					<div className="space-y-0.5 p-1">
						{models.data.map((model) => (
							<Button
								key={model.modelId}
								type="button"
								variant="ghost"
								size="sm"
								className="h-auto min-h-11 w-full justify-start rounded-md px-2.5 py-1.5 text-left"
								onClick={() => onSelect(model.modelId)}
							>
								<span className="min-w-0 flex-1">
									<span className="block truncate text-sm">{model.name}</span>
									<span className="block truncate font-mono text-[11px] text-muted-foreground">{model.modelId}</span>
								</span>
							</Button>
						))}
					</div>
				</ScrollArea>
			)}
		</div>
	);
}
