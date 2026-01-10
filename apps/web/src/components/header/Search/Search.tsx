"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/components/ui/command";
import { DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Search as SearchIcon, Sparkles } from "lucide-react";
import { curatedGroups } from "./Search.constants";
import { SearchRowItem } from "./SearchRowItem";
import type { SearchData } from "@/lib/fetchers/search/getSearchData";

interface Props {
	className?: string;
	initialData: SearchData;
}

export default function Search({ className, initialData }: Props) {
	const router = useRouter();

	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			const mod = event.metaKey || event.ctrlKey;
			if (!mod) return;
			if (event.key.toLowerCase() === "k") {
				event.preventDefault();
				setOpen((value) => !value);
			}
		}

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	// Reset query when dialog closes
	const handleOpenChange = (newOpen: boolean) => {
		setOpen(newOpen);
		if (!newOpen) {
			setQuery("");
		}
	};

	const handleSelect = (href: string) => {
		setOpen(false);
		router.push(href);
	};

	const hasQuery = query.trim().length > 0;

	// Slice data based on whether user is searching
	const displayLimit = hasQuery ? 50 : 6;
	const modelsToShow = initialData.models.slice(0, displayLimit);
	const orgsToShow = initialData.organisations.slice(0, displayLimit);
	const benchmarksToShow = initialData.benchmarks.slice(0, displayLimit);
	const providersToShow = initialData.apiProviders.slice(0, displayLimit);
	const plansToShow = initialData.subscriptionPlans.slice(0, displayLimit);
	const countriesToShow = initialData.countries.slice(0, displayLimit);

	return (
		<div className={cn("flex items-center gap-2", className)}>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/60 dark:text-zinc-300 dark:hover:bg-zinc-800"
				aria-label="Open search"
			>
				<SearchIcon className="size-5" />
			</button>

			<CommandDialog open={open} onOpenChange={handleOpenChange}>
				<DialogTitle className="sr-only">Search</DialogTitle>
				<CommandInput
					value={query}
					onValueChange={setQuery}
					placeholder="Search models, organisations, benchmarks..."
					aria-label="Search catalogue"
				/>
				<CommandList className="max-h-[60vh] lg:max-h-[70vh]">
					<CommandEmpty className="py-12">
						<div className="flex flex-col items-center gap-3">
							<div className="size-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
								<SearchIcon className="size-6 text-zinc-400" />
							</div>
							<div className="text-center">
								<p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
									No results found
								</p>
								<p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
									Try different keywords or check your spelling
								</p>
							</div>
						</div>
					</CommandEmpty>

					{/* Quick Actions - Always visible when no query */}
					{!hasQuery && curatedGroups[0] && (
						<>
							<CommandGroup heading={curatedGroups[0].label}>
								{curatedGroups[0].items.map((item) => (
									<CommandItem
										key={item.id}
										value={item.href}
										onSelect={() => handleSelect(item.href)}
										className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
									>
										<Sparkles className="size-[18px] shrink-0 text-zinc-400" />
										<span className="text-sm font-medium">{item.title}</span>
									</CommandItem>
								))}
							</CommandGroup>
							<CommandSeparator />
						</>
					)}

					{/* Models */}
					{modelsToShow.length > 0 && (
						<>
							<CommandGroup heading="Models">
								{modelsToShow.map((model) => (
									<SearchRowItem
										key={model.id}
										{...model}
										keywords={model.searchKeywords}
										onSelect={handleSelect}
									/>
								))}
							</CommandGroup>
							<CommandSeparator />
						</>
					)}

					{/* Organisations */}
					{orgsToShow.length > 0 && (
						<>
							<CommandGroup heading="Organisations">
								{orgsToShow.map((org) => (
									<SearchRowItem
										key={org.id}
										{...org}
										keywords={org.searchKeywords}
										onSelect={handleSelect}
									/>
								))}
							</CommandGroup>
							<CommandSeparator />
						</>
					)}

					{/* Benchmarks */}
					{benchmarksToShow.length > 0 && (
						<>
							<CommandGroup heading="Benchmarks">
								{benchmarksToShow.map((benchmark) => (
									<SearchRowItem
										key={benchmark.id}
										{...benchmark}
										keywords={benchmark.searchKeywords}
										onSelect={handleSelect}
									/>
								))}
							</CommandGroup>
							<CommandSeparator />
						</>
					)}

					{/* API Providers */}
					{providersToShow.length > 0 && (
						<>
							<CommandGroup heading="API Providers">
								{providersToShow.map((provider) => (
									<SearchRowItem
										key={provider.id}
										{...provider}
										keywords={provider.searchKeywords}
										onSelect={handleSelect}
									/>
								))}
							</CommandGroup>
							<CommandSeparator />
						</>
					)}

					{/* Subscription Plans */}
					{plansToShow.length > 0 && (
						<>
							<CommandGroup heading="Subscription Plans">
								{plansToShow.map((plan) => (
									<SearchRowItem
										key={plan.id}
										{...plan}
										keywords={plan.searchKeywords}
										onSelect={handleSelect}
									/>
								))}
							</CommandGroup>
							<CommandSeparator />
						</>
					)}

					{/* Countries */}
					{countriesToShow.length > 0 && (
						<>
							<CommandGroup heading="Countries">
								{countriesToShow.map((country) => (
									<SearchRowItem
										key={country.id}
										{...country}
										keywords={country.searchKeywords}
										onSelect={handleSelect}
									/>
								))}
							</CommandGroup>
						</>
					)}

					{/* Featured items when no query */}
					{!hasQuery && (
						<>
							{curatedGroups.slice(1).map((group) => (
								<Fragment key={group.type}>
									<CommandSeparator />
									<CommandGroup heading={group.label}>
										{group.items.map((item) => (
											<CommandItem
												key={item.id}
												value={item.href}
												onSelect={() => handleSelect(item.href)}
												className="flex items-center gap-3 px-3 py-2.5 cursor-pointer"
											>
												<div className="size-[18px] shrink-0 rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
													{item.logoId && (
														<img
															src={`https://models.dev/logos/${item.logoId}.svg`}
															alt={item.title}
															className="h-full w-full object-contain"
														/>
													)}
													{item.flagIso && (
														<img
															src={`/flags/${item.flagIso}.svg`}
															alt={item.title}
															className="h-full w-full object-cover"
														/>
													)}
												</div>
												<div className="flex flex-1 flex-col gap-0.5 min-w-0">
													<span className="text-sm font-medium truncate">
														{item.title}
													</span>
													{item.subtitle && (
														<span className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
															{item.subtitle}
														</span>
													)}
												</div>
											</CommandItem>
										))}
									</CommandGroup>
								</Fragment>
							))}
						</>
					)}
				</CommandList>
			</CommandDialog>
		</div>
	);
}
