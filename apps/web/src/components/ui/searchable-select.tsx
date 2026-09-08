"use client";

import { type ReactNode, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";

export function SearchableSelect({ id, label, value, options, onValueChange, disabled = false, placeholder = "Select…", allowCustom = false }: {
  id?: string; label: string; value: string;
  options: Array<{ value: string; label: string; disabled?: boolean; icon?: ReactNode; description?: string }>;
  onValueChange: (value: string) => void; disabled?: boolean; placeholder?: string; allowCustom?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value);
  const choose = (next: string) => { onValueChange(next); setOpen(false); };
  return <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setQuery(""); }}>
    <PopoverTrigger asChild><Button id={id} type="button" variant="outline" role="combobox" aria-label={label} aria-expanded={open} disabled={disabled} className="min-h-11 w-full justify-between font-normal">
      <span className="flex min-w-0 items-center gap-2">{selected?.icon}<span className="truncate">{selected?.label || (value ? "Unavailable selection" : placeholder)}</span></span><ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
    </Button></PopoverTrigger>
    <PopoverContent align="start" className="w-[var(--anchor-width)] max-w-[calc(100vw-2rem)] gap-0 p-1">
      <Command filter={(value, search, keywords) => {
        const text = [value, ...(keywords ?? [])].join(" ").toLowerCase();
        return (search.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).every((word) => text.includes(word)) ? 1 : 0;
      }}><CommandInput aria-label={`Search ${label.toLowerCase()}`} placeholder={`Search ${label.toLowerCase()}…`} value={query} onValueChange={setQuery} />
        <CommandList className="max-h-64 overscroll-contain"><CommandEmpty>No matches found.</CommandEmpty><CommandGroup>
          {options.map((option) => <CommandItem key={option.value} value={option.value} keywords={[option.label]} disabled={option.disabled} data-checked={option.value === value} onSelect={() => choose(option.value)}>{option.icon}<span className="min-w-0"><span className="block truncate">{option.label}</span>{option.description ? <span className="block truncate text-xs text-muted-foreground">{option.description}</span> : null}</span></CommandItem>)}
          {allowCustom && query.trim() && !options.some((option) => option.value === query.trim()) ? <CommandItem value={query.trim()} onSelect={() => choose(query.trim())}>Use “{query.trim()}”</CommandItem> : null}
        </CommandGroup></CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}
