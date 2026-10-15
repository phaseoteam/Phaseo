import { useEffect, useRef } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "../lib/utils";

const input = "h-8 min-w-0 flex-1 rounded-lg border border-input bg-background/40 px-2.5 font-mono text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-ring focus:ring-2 focus:ring-ring/20";

/** Command-line arguments as a list of fields, each passed to the program as one argument. */
export function ArgumentFields({ value, onChange, disabled = false }: { value: string[]; onChange: (value: string[]) => void; disabled?: boolean }) {
	const fieldset = useRef<HTMLFieldSetElement>(null);
	const focusAdded = useRef(false);
	useEffect(() => { if (focusAdded.current) { focusAdded.current = false; fieldset.current?.querySelector<HTMLInputElement>(".argument-row:last-of-type input")?.focus(); } }, [value.length]);
	return <fieldset className="argument-fields flex min-w-0 flex-col gap-1.5" ref={fieldset} disabled={disabled}>
		<legend className="mb-1.5 text-xs font-medium text-muted-foreground">Arguments <span className="font-normal">· each field is passed as one argument</span></legend>
		{value.map((argument, index) => <div className="argument-row flex items-center gap-1.5" key={index}>
			<input aria-label={`Argument ${index + 1}`} value={argument} maxLength={10000} placeholder={index === 0 ? "--acp" : undefined} onChange={event => onChange(value.map((current, position) => position === index ? event.target.value : current))} className={input} />
			<button type="button" aria-label={`Remove argument ${index + 1}`} title="Remove argument" onClick={() => onChange(value.filter((_, position) => position !== index))}
				className="grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"><X className="size-3.5" /></button>
		</div>)}
		<button className={cn("add-argument inline-flex h-8 w-fit items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 text-[13px] font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground disabled:opacity-50")} type="button" disabled={value.length >= 100}
			onClick={() => { focusAdded.current = true; onChange([...value, ""]); }}><Plus className="size-3.5" />Add argument</button>
	</fieldset>;
}
