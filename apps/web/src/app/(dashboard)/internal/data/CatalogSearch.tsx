"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const resources = [
	{ value: "models", label: "Models" },
	{ value: "api-providers", label: "Providers" },
	{ value: "organisations", label: "Organisations" },
	{ value: "benchmarks", label: "Benchmarks" },
] as const;

export function CatalogSearch() {
	const router = useRouter();
	const inputRef = useRef<HTMLInputElement>(null);
	const [resource, setResource] = useState<(typeof resources)[number]["value"]>("models");
	const [query, setQuery] = useState("");

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
			const target = event.target as HTMLElement | null;
			if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
			event.preventDefault();
			inputRef.current?.focus();
		};
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	return (
		<form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); const value = query.trim(); router.push(`/internal/data/${resource}${value ? `?q=${encodeURIComponent(value)}` : ""}`); }}>
			<div className="relative min-w-0 flex-1">
				<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
				<input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a record by name or ID" aria-label="Find a catalog record" className="h-10 w-full rounded-md border bg-background pl-9 pr-12 text-sm shadow-xs outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30" />
				<kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">/</kbd>
			</div>
			<select value={resource} onChange={(event) => setResource(event.target.value as typeof resource)} aria-label="Record type" className="h-10 rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30">
				{resources.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
			</select>
			<button type="submit" className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary/80">Search</button>
		</form>
	);
}
