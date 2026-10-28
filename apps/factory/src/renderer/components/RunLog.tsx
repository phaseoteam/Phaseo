import { CircleAlert, CornerDownRight, Info, MessageSquareText, UserRound, Wrench } from "lucide-react";
import { useEffect, useRef } from "react";
import type { LogKind, LogLine } from "../../shared/types";
import { clock } from "../lib/format";
import { cn } from "../lib/utils";
import { Markdown } from "./Markdown";

const KIND: Record<LogKind, { icon: typeof Info; className: string }> = {
	info: { icon: Info, className: "text-muted-foreground" },
	tool: { icon: Wrench, className: "text-muted-foreground" },
	text: { icon: MessageSquareText, className: "text-foreground" },
	error: { icon: CircleAlert, className: "text-destructive" },
	result: { icon: CornerDownRight, className: "text-success" },
	you: { icon: UserRound, className: "text-foreground" },
};

/** A run's log, newest at the bottom. Follows new lines while scrolled to the end. */
export function RunLog({ lines, live, limit, className }: { lines: LogLine[]; live?: boolean; limit?: number; className?: string }) {
	const box = useRef<HTMLDivElement>(null);
	const shown = limit ? lines.slice(-limit) : lines;
	useEffect(() => {
		// Follow new lines inside the log's own scroll box, never by scrolling the page.
		if (live && box.current) box.current.scrollTop = box.current.scrollHeight;
	}, [live, lines.length]);
	return <div ref={box} data-selectable className={cn("font-mono text-xs leading-relaxed", className)}>
		{limit && lines.length > limit && <div className="px-3 py-1 text-muted-foreground">{lines.length - limit} earlier lines</div>}
		{shown.map((line, index) => {
			const { icon: Icon, className: tone } = KIND[line.kind];
			return <div key={`${line.at}-${index}`} className={cn("flex gap-3 px-3 py-0.5 hover:bg-accent/40", line.kind === "you" && "my-1 bg-accent/70 py-1 font-sans text-sm hover:bg-accent/70")}>
				<span className="shrink-0 text-muted-foreground/60 tabular-nums">{clock(line.at)}</span>
				<Icon className={cn("mt-0.5 size-3.5 shrink-0", tone)} />
				{/* What the agent says is Markdown; tool calls and Factory's own lines are plain. */}
				{line.kind === "text"
					? <Markdown source={line.text} className="min-w-0 flex-1 font-sans text-[13px] leading-relaxed" />
					: <span className={cn("min-w-0 whitespace-pre-wrap break-words", line.kind === "tool" ? "text-muted-foreground" : tone)}>{line.text}</span>}
			</div>;
		})}
		{live && <div className="flex gap-3 px-3 py-0.5">
			<span className="shrink-0 text-muted-foreground/60">{"        "}</span>
			<span className="inline-block h-3.5 w-1.5 animate-pulse bg-foreground/70" />
		</div>}
	</div>;
}
