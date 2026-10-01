"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
			<Popover><PopoverTrigger asChild><Button variant="outline" size="sm">Models ({visible.length})</Button></PopoverTrigger>
				<PopoverContent align="end" className="w-80 space-y-3">
					<Input aria-label="Find models to compare" placeholder="Find models" value={query} onChange={(event) => setQuery(event.target.value)} />
					<div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Select all</Button><Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button></div>
					<div className="max-h-72 space-y-3 overflow-y-auto">
						{options.map((entry) => <label key={entry.model_id} className="flex cursor-pointer items-center gap-3 text-sm">
							<Checkbox checked={selected === null || selected.has(entry.model_id)} onCheckedChange={(checked) => setSelected((current) => { const next = new Set(current ?? entries.map((item) => item.model_id)); if (checked) next.add(entry.model_id); else next.delete(entry.model_id); return next; })} />
							<span>{entry.model_name}</span>
						</label>)}
						{!options.length ? <p className="text-sm text-muted-foreground">No models match your search.</p> : null}
					</div>
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
