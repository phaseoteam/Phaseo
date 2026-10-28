import { ArrowLeft, Check, ChevronDown } from "lucide-react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { cn } from "../lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { ScrollArea } from "./ui/scroll-area";

/** Building blocks for settings-style pages: titled groups of rows with a control on the right. */

/** In a narrow window a settings page fills it, and leads with a link back to the list of pages. */
export const SettingsBack = createContext<string | null>(null);

/** One settings page: a centred column under a large title. The first group sits closer to the title. */
export function SettingsPage({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
	const back = useContext(SettingsBack);
	return <ScrollArea className="min-h-0 min-w-0 flex-1">
		<div className="mx-auto max-w-[760px] px-4 pt-10 pb-16 sm:px-8 [&>section:first-of-type]:mt-7">
			{back && <a href={back} className="-mt-5 mb-4 -ml-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground"><ArrowLeft className="size-4" />Settings</a>}
			<h1 className="text-[26px] font-bold tracking-tight">{title}</h1>
			{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
			{children}
		</div>
	</ScrollArea>;
}

export function Group({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
	return <section className="mt-9">
		<h2 className="text-[15px] font-bold">{title}</h2>
		{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
		<div className="mt-3 divide-y rounded-md border">{children}</div>
	</section>;
}

export function Row({ title, description, mark, children }: { title: ReactNode; description: ReactNode; mark?: ReactNode; children?: ReactNode }) {
	return <div className="flex items-center gap-4 px-4 py-3.5">
		{mark}
		<div className="min-w-0 flex-1">
			<div className="text-sm font-medium">{title}</div>
			<div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
		</div>
		{children}
	</div>;
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
	return <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={cn("relative h-5 w-9 shrink-0 rounded-md transition-colors", on ? "bg-primary" : "bg-input")}>
		<span className={cn("absolute top-0.5 left-0 size-4 rounded-[5px] bg-white shadow-sm transition-transform", on ? "translate-x-[18px]" : "translate-x-0.5")} />
	</button>;
}

/** A text input that saves when it loses focus or on Enter. */
export function Field({ value, placeholder, onSave, mono, className }: { value: string; placeholder: string; onSave: (value: string) => void; mono?: boolean; className?: string }) {
	const [draft, setDraft] = useState(value);
	useEffect(() => setDraft(value), [value]);
	return <input value={draft} placeholder={placeholder} onChange={(event) => setDraft(event.target.value)} onBlur={() => draft !== value && onSave(draft.trim())} onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()} className={cn("h-8 w-72 rounded-md border bg-background px-2.5 text-sm outline-none focus:border-ring", mono && "font-mono text-xs", className)} />;
}

/** A multi-line field that saves when it loses focus. */
export function TextBox({ value, placeholder, onSave, rows = 6, className }: { value: string; placeholder?: string; onSave: (value: string) => void; rows?: number; className?: string }) {
	const [draft, setDraft] = useState(value);
	useEffect(() => setDraft(value), [value]);
	return <textarea value={draft} placeholder={placeholder} rows={rows} onChange={(event) => setDraft(event.target.value)} onBlur={() => draft !== value && onSave(draft)} className={cn("block w-full resize-y rounded-md border bg-background px-3 py-2 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/70 focus:border-ring", className)} />;
}

export function Choice<T extends string | number>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
	const selected = options.find((option) => option.value === value);
	return <DropdownMenu>
		<DropdownMenuTrigger render={<button type="button" className="flex h-8 min-w-36 items-center justify-between gap-2 rounded-md border px-2.5 text-sm hover:bg-accent/60">
			<span>{selected?.label ?? String(value)}</span>
			<ChevronDown className="size-3.5 text-muted-foreground" />
		</button>} />
		<DropdownMenuContent align="end" className="w-48">
			{options.map((option) => <DropdownMenuItem key={String(option.value)} onClick={() => onChange(option.value)}>
				<span className="flex-1">{option.label}</span>
				{option.value === value ? <Check className="size-3.5" /> : <span className="size-3.5" />}
			</DropdownMenuItem>)}
		</DropdownMenuContent>
	</DropdownMenu>;
}
