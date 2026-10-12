import { useLayoutEffect, useRef, type ClipboardEvent, type ReactNode, type RefObject } from "react";
import { ArrowUp, Square } from "lucide-react";
import { cn } from "../lib/utils";

export function Composer({ value, onChange, onSubmit, onStop, onPaste, placeholder, disabled, canSend, running, size = "default", chips, tools, model, inputRef, footer, className }: {
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	onStop?: () => void;
	onPaste?: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
	placeholder: string;
	disabled?: boolean;
	canSend: boolean;
	running?: boolean;
	size?: "default" | "large";
	chips?: ReactNode;
	tools?: ReactNode;
	model?: ReactNode;
	footer?: ReactNode;
	inputRef?: RefObject<HTMLTextAreaElement | null>;
	className?: string;
}) {
	const local = useRef<HTMLTextAreaElement>(null);
	const input = inputRef ?? local;
	const min = size === "large" ? 72 : 44;
	useLayoutEffect(() => {
		const element = input.current;
		if (!element) return;
		element.style.height = "0px";
		element.style.height = `${Math.min(240, Math.max(min, element.scrollHeight))}px`;
	}, [value, input, min]);
	return <div className={cn("w-full", className)}>
		<form onSubmit={event => { event.preventDefault(); if (canSend) onSubmit(); }}
			onClick={event => { if (event.target === event.currentTarget) input.current?.focus(); }}
			className="rounded-2xl border border-input bg-card shadow-sm transition-colors focus-within:border-ring/60 focus-within:ring-3 focus-within:ring-ring/15 dark:shadow-black/20">
			{chips && <div className="flex flex-wrap gap-1.5 px-3 pt-3">{chips}</div>}
			<textarea ref={input} value={value} disabled={disabled} placeholder={placeholder} maxLength={100000} rows={1} aria-label="Message"
				onPaste={onPaste} onChange={event => onChange(event.target.value)}
				onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.altKey && !event.nativeEvent.isComposing && !event.repeat) { event.preventDefault(); if (canSend) onSubmit(); } }}
				className={cn("block w-full resize-none bg-transparent px-4 pt-3.5 pb-1 leading-relaxed outline-none placeholder:text-muted-foreground/80 disabled:opacity-60", size === "large" ? "text-[15px]" : "text-[14px]")} />
			<div className="flex items-center gap-1 px-2 pt-1 pb-2">
				{tools}
				<div className="ml-auto flex min-w-0 items-center gap-1">
					{model}
					{running && onStop
						? <button type="button" aria-label="Stop" title="Stop" onClick={onStop} className="ml-1 grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-background transition-opacity hover:opacity-85"><Square className="size-3 fill-current" /></button>
						: <button type="submit" aria-label="Send" title="Send (Enter)" disabled={!canSend} className="ml-1 grid size-8 shrink-0 place-items-center rounded-full bg-foreground text-background transition-opacity hover:opacity-85 disabled:opacity-25"><ArrowUp className="size-4" strokeWidth={2.5} /></button>}
				</div>
			</div>
		</form>
		{footer}
	</div>;
}

export function ComposerChip({ children, onRemove, title }: { children: ReactNode; onRemove?: () => void; title?: string }) {
	return <span title={title} className="inline-flex h-6 max-w-56 items-center gap-1.5 rounded-md border border-border bg-muted/60 pr-1 pl-2 text-xs text-foreground/85">
		<span className="truncate">{children}</span>
		{onRemove && <button type="button" aria-label="Remove" onClick={onRemove} className="grid size-4 place-items-center rounded text-muted-foreground hover:bg-background hover:text-foreground">×</button>}
	</span>;
}

export function ToolButton({ label, onClick, disabled, active, children }: { label: string; onClick?: () => void; disabled?: boolean; active?: boolean; children: ReactNode }) {
	return <button type="button" aria-label={label} title={label} disabled={disabled} aria-pressed={active} onClick={onClick}
		className={cn("flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40 [&_svg]:size-4", active && "bg-muted text-foreground")}>{children}</button>;
}
