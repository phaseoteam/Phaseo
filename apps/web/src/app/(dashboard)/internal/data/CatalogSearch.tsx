"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
				<Input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a record by name or ID" aria-label="Find a catalog record" className="h-11 w-full pl-9 pr-12 text-base sm:text-sm" />
				<kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">/</kbd>
			</div>
			<Select value={resource} onValueChange={(value) => setResource(value as typeof resource)}>
				<SelectTrigger aria-label="Record type" className="min-h-11 w-full sm:w-44"><SelectValue>{resources.find((item) => item.value === resource)?.label}</SelectValue></SelectTrigger>
				<SelectContent>{resources.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
			</Select>
			<Button type="submit" className="min-h-11">Search</Button>
		</form>
	);
}
