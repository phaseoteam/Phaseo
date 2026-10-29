import { FileText, Paperclip, SquareTerminal } from "lucide-react";
import { useEffect, useState } from "react";
import { diffLineKind, looksLikeDiff, type DiffLineKind } from "../../shared/proofText";
import type { ProofFile, Run } from "../../shared/types";
import { InlineMarkdown } from "./Markdown";
import { cn } from "../lib/utils";

export const proofUrl = (run: Pick<Run, "id">, file: Pick<ProofFile, "name">) => `factory-proof://${run.id}/${encodeURIComponent(file.name)}`;

/** Text proof is loaded when it's opened, so long logs don't slow the page. */
function TextProof({ run, file }: { run: Run; file: ProofFile }) {
	const [open, setOpen] = useState(false);
	const [text, setText] = useState<string | null>(null);
	useEffect(() => {
		if (!open || text !== null) return;
		void fetch(proofUrl(run, file)).then((response) => response.text()).then(setText, () => setText("Couldn't read this file."));
	}, [open, text, run, file]);
	return <div className="rounded-md border">
		<button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/40">
			<FileText className="size-3.5 shrink-0 text-muted-foreground" />
			<span className="font-mono text-xs">{file.name}</span>
			<span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{file.caption && <InlineMarkdown source={file.caption} />}</span>
			<span className="text-2xs text-muted-foreground">{open ? "Hide" : "Show"}</span>
		</button>
		{open && (text !== null && looksLikeDiff(text)
			? <DiffText text={text} />
			: <pre data-selectable className="max-h-96 overflow-auto border-t bg-muted/30 px-3 py-2 font-mono text-xs leading-relaxed whitespace-pre-wrap">{text ?? "Loading…"}</pre>)}
	</div>;
}

const DIFF_LINE: Record<DiffLineKind, string> = {
	file: "font-semibold text-foreground/80",
	hunk: "bg-info/10 text-info",
	add: "bg-success/12 text-foreground",
	remove: "bg-destructive/10 text-foreground",
	context: "text-foreground/80",
};

/** A diff with its added and removed lines marked, the way GitHub shows one. */
function DiffText({ text }: { text: string }) {
	const lines = text.replace(/\n$/, "").split("\n");
	return <div data-selectable className="max-h-96 overflow-auto border-t bg-muted/30 py-1 font-mono text-xs leading-relaxed">
		{lines.map((line, index) => {
			const kind = diffLineKind(line);
			// A gap above each file after the first, so files read apart.
			return <div key={index} className={cn("px-3 whitespace-pre-wrap", DIFF_LINE[kind], kind === "file" && line.startsWith("diff --git") && index > 0 && "mt-2")}>{line || " "}</div>;
		})}
	</div>;
}

function Media({ run, file, onOpen }: { run: Run; file: ProofFile; onOpen: () => void }) {
	return <figure className="min-w-0">
		{file.kind === "video"
			? <video src={proofUrl(run, file)} controls className="aspect-[16/10] w-full rounded-md border bg-muted object-contain" />
			: <button type="button" onClick={onOpen} className="block w-full overflow-hidden rounded-md border bg-muted hover:border-foreground/30"><img src={proofUrl(run, file)} alt={file.caption ?? file.name} className="aspect-[16/10] w-full object-cover object-top" /></button>}
		<figcaption className="mt-1.5 text-xs leading-snug"><span className="font-mono text-2xs text-muted-foreground">{file.name}</span>{file.caption && <span className="block text-foreground/85"><InlineMarkdown source={file.caption} /></span>}</figcaption>
	</figure>;
}

/** Puts before- and after- files next to each other, whatever order they were saved in. */
function pairUp(files: ProofFile[]): ProofFile[] {
	const key = (name: string) => name.replace(/^(before|after)[-_]/i, "");
	return [...files].sort((a, b) => key(a.name).localeCompare(key(b.name)) || (/^before/i.test(a.name) ? -1 : 1));
}

/** What a run showed for itself: screenshots and recordings, logs, and the commands it ran. */
export function ProofView({ run, className }: { run: Run; className?: string }) {
	const [zoom, setZoom] = useState<ProofFile | null>(null);
	const report = run.report;
	if (!report) return null;
	const media = pairUp(report.files.filter((file) => file.kind === "image" || file.kind === "video"));
	const texts = report.files.filter((file) => file.kind === "text");
	const other = report.files.filter((file) => file.kind === "file");
	if (!media.length && !texts.length && !other.length && !report.notes.length) return <p className={cn("text-xs text-muted-foreground", className)}>No proof attached.</p>;
	return <div className={cn("space-y-3", className)}>
		{media.length > 0 && <div className={cn("grid gap-3", media.length > 1 ? "grid-cols-2" : "grid-cols-1 max-w-[520px]")}>
			{media.map((file) => <Media key={file.name} run={run} file={file} onOpen={() => setZoom(file)} />)}
		</div>}
		{report.notes.length > 0 && <ul className="space-y-1">
			{report.notes.map((note) => <li key={note} className="flex gap-2 text-xs leading-relaxed"><SquareTerminal className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /><span data-selectable className="min-w-0"><InlineMarkdown source={note} /></span></li>)}
		</ul>}
		{texts.map((file) => <TextProof key={file.name} run={run} file={file} />)}
		{other.map((file) => <div key={file.name} className="flex items-center gap-2 text-xs text-muted-foreground"><Paperclip className="size-3.5" /><span className="font-mono">{file.name}</span>{file.caption && <InlineMarkdown source={file.caption} />}</div>)}
		{zoom && <button type="button" aria-label="Close" onClick={() => setZoom(null)} className="fixed inset-0 z-50 grid place-items-center bg-background/85 p-10 backdrop-blur-sm">
			<img src={proofUrl(run, zoom)} alt={zoom.caption ?? zoom.name} className="max-h-full max-w-full rounded-md border shadow-lg" />
		</button>}
	</div>;
}
