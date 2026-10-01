"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, ListChecks, ListX } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PublicIntelligenceValueEntry } from "@/lib/fetchers/frontend/fetchPublicCatalog";
import { IntelligenceValueBars } from "./IntelligenceValueBars";
import { IntelligenceValueTable } from "./IntelligenceValueTable";

const Scatter = dynamic(() => import("./IntelligenceValueScatter"), { ssr: false, loading: () => <div className="flex h-96 items-center justify-center text-sm text-muted-foreground" role="status">Loading value chart…</div> });

export function IntelligenceValueComparison({ entries, limit, onShowMore }: { entries: PublicIntelligenceValueEntry[]; limit: number; onShowMore: () => void }) {
	const [view, setView] = useState<"bars" | "scatter">("bars");
	const [selected, setSelected] = useState<Set<string> | null>(null);
	const [query, setQuery] = useState("");
	const visible = entries.filter((entry) => selected === null || selected.has(entry.model_id));
	const options = entries.filter((entry) => `${entry.model_name} ${entry.organisation_name ?? ""}`.toLowerCase().includes(query.toLowerCase()));
	return <>
		<div className="flex flex-wrap items-center justify-between gap-3 pt-4">
			<div role="group" aria-label="Value chart display" className="flex gap-2">
				<Button variant={view === "bars" ? "secondary" : "ghost"} size="sm" aria-pressed={view === "bars"} onClick={() => setView("bars")}>USD per point</Button>
				<Button variant={view === "scatter" ? "secondary" : "ghost"} size="sm" aria-pressed={view === "scatter"} onClick={() => setView("scatter")}>Score vs cost</Button>
			</div>
			<Popover><PopoverTrigger asChild><Button variant="outline" size="sm" className="w-full justify-between sm:w-64"><span>{visible.length} of {entries.length} models</span><ChevronsUpDown className="size-3.5 text-muted-foreground" /></Button></PopoverTrigger>
				<PopoverContent initialFocus={false} align="end" className="w-[min(28rem,calc(100vw-2rem))] gap-0 p-0">
					<Command shouldFilter={false}><CommandInput value={query} onValueChange={setQuery} placeholder="Search models…" /><CommandList className="max-h-80"><CommandEmpty>No evaluated model found.</CommandEmpty><CommandGroup>
						{options.map((entry) => <CommandItem key={entry.model_id} value={entry.model_id} data-checked={selected === null || selected.has(entry.model_id)} onSelect={() => setSelected((current) => { const next = new Set(current ?? entries.map((item) => item.model_id)); if (next.has(entry.model_id)) next.delete(entry.model_id); else next.add(entry.model_id); return next; })} className="min-h-8 py-1">
							<span className="relative size-5 shrink-0 overflow-hidden rounded bg-muted"><Logo id={entry.organisation_id ?? entry.model_id} alt="" fill className="object-contain p-0.5" /></span>
							<span className="min-w-0 flex-1 truncate">{entry.model_name}</span>
						</CommandItem>)}
					</CommandGroup></CommandList></Command>
					<div className="grid grid-cols-2 gap-1.5 border-t bg-popover p-2"><Button variant="ghost" size="sm" className="h-8 justify-between bg-muted/40 px-2.5 text-xs" onClick={() => setSelected(new Set())}>Clear<ListX className="size-3.5" /></Button><Button variant="ghost" size="sm" className="h-8 justify-between bg-muted/40 px-2.5 text-xs" onClick={() => setSelected(null)}>Select all<ListChecks className="size-3.5" /></Button></div>
				</PopoverContent>
			</Popover>
		</div>
		{visible.length ? <>
			{view === "bars" ? <IntelligenceValueBars entries={visible} /> : <Scatter entries={visible} />}
			<IntelligenceValueTable entries={visible.slice(0, limit)} />
			{visible.length > limit ? <div className="flex justify-end py-3"><Button variant="ghost" size="sm" onClick={onShowMore}>Show more</Button></div> : null}
		</> : <p className="py-10 text-center text-sm text-muted-foreground">Select models to compare.</p>}
	</>;
}
