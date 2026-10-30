import { ArrowUpRight, Check, ChevronDown, ChevronRight, FileCode2, MessageSquarePlus, Plus } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { commentSide, parsePatch, type PatchRow } from "../../../shared/factory/patch";
import type { GithubChange, PullFile, PullFiles, ReviewThread, WorkItem } from "../../../shared/factory/types";
import { errorText } from "../components/AddRepo";
import { Button } from "../../components/ui/button";
import { factory, openExternal } from "../lib/useFactory";
import { cn } from "../../lib/utils";
import { CommentEntry } from "./Timeline";

/** Past this many changed lines a file starts folded, so a big pull request opens quickly. */
const FOLD_OVER = 400;

/** A pull request's files, read when the tab opens and again whenever the pull request changes. */
function usePullFiles(item: WorkItem) {
	const [state, setState] = useState<{ key: string; data: PullFiles | null; error: string | null }>({ key: "", data: null, error: null });
	const [tick, setTick] = useState(0);
	const key = `${item.id}@${item.updatedAt}@${tick}`;
	useEffect(() => {
		let current = true;
		void factory().pullFiles(item.id)
			.then((data) => current && setState({ key, data, error: null }))
			.catch((cause: unknown) => current && setState((previous) => ({ key, data: previous.data, error: errorText(cause) })));
		return () => {
			current = false;
		};
	}, [item.id, key]);
	return { ...state, reload: () => setTick((count) => count + 1) };
}

async function change(item: WorkItem, next: GithubChange) {
	await factory().changeOnGithub(item.id, next);
}

/** A box for writing a comment or a reply, with what to do once it's sent. */
function Writer({ placeholder, action, onSend, onCancel, autoFocus }: { placeholder: string; action: string; onSend: (body: string) => Promise<void>; onCancel?: () => void; autoFocus?: boolean }) {
	const [text, setText] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const send = async () => {
		if (!text.trim()) return;
		setBusy(true);
		setError(null);
		try {
			await onSend(text);
			setText("");
		} catch (cause) {
			setError(errorText(cause));
		} finally {
			setBusy(false);
		}
	};
	return <div className="rounded-md border bg-background focus-within:border-ring">
		<textarea value={text} autoFocus={autoFocus} rows={Math.min(10, Math.max(2, text.split("\n").length))} placeholder={placeholder} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => {
			if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
				event.preventDefault();
				void send();
			}
			if (event.key === "Escape" && onCancel) onCancel();
		}} className="block w-full resize-none bg-transparent px-3 py-2 font-sans text-sm leading-relaxed outline-none placeholder:text-muted-foreground" />
		<div className="flex items-center justify-end gap-2 border-t px-2 py-1.5">
			{error && <p className="mr-auto pl-1 text-xs text-destructive">{error}</p>}
			{onCancel && <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>}
			<Button size="sm" disabled={busy || !text.trim()} onClick={() => void send()}>{busy ? "Posting…" : action}</Button>
		</div>
	</div>;
}

/** A conversation on a line: its comments, a reply box, and Resolve. Resolved ones fold away. */
function ThreadView({ thread, item, onChanged }: { thread: ReviewThread; item: WorkItem; onChanged: () => void }) {
	const [open, setOpen] = useState(!thread.resolved);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const first = thread.comments[0];
	const last = thread.comments.at(-1);
	const resolve = async () => {
		setBusy(true);
		setError(null);
		try {
			await change(item, { kind: "resolve", threadId: thread.id, resolved: !thread.resolved });
			onChanged();
		} catch (cause) {
			setError(errorText(cause));
		} finally {
			setBusy(false);
		}
	};
	return <div className="my-2 rounded-md border bg-card font-sans">
		<div className="flex items-center gap-2 border-b px-3 py-1.5 text-xs text-muted-foreground">
			<button type="button" onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left hover:text-foreground">
				{open ? <ChevronDown className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0" />}
				<span className="truncate">{thread.resolved ? "Resolved" : thread.outdated ? "Outdated" : "Conversation"}: {thread.comments.length} {thread.comments.length === 1 ? "comment" : "comments"}{!open && first ? `, ${first.author}: ${first.body.slice(0, 80)}` : ""}</span>
			</button>
			{thread.canResolve && <Button variant="outline" size="sm" className="h-6 px-2 text-2xs" disabled={busy} onClick={() => void resolve()}>
				{thread.resolved ? "Unresolve" : <><Check className="size-3" />Resolve</>}
			</Button>}
		</div>
		{error && <p className="px-3 pt-1.5 text-xs text-destructive">{error}</p>}
		{open && <div className="px-3">
			<div className="divide-y">{thread.comments.map((comment) => <CommentEntry key={comment.id} comment={comment} item={item} inline compact />)}</div>
			{last?.databaseId && <div className="pb-3"><Writer placeholder="Reply. Ctrl+Enter posts it." action="Reply" onSend={async (body) => {
				await change(item, { kind: "reply", commentId: first!.databaseId!, body });
				onChanged();
			}} /></div>}
		</div>}
	</div>;
}

const ROW = { add: "bg-success/10", remove: "bg-destructive/10", context: "", hunk: "bg-info/5 text-muted-foreground" } as const;
const SIGN = { add: "+", remove: "-", context: " ", hunk: "" } as const;

/** One file's diff, with the conversations on its lines and a + to start one. */
function FileDiff({ file, threads, item, head, onChanged }: { file: PullFile; threads: ReviewThread[]; item: WorkItem; head: string; onChanged: () => void }) {
	const big = file.additions + file.deletions > FOLD_OVER;
	const [open, setOpen] = useState(!big && file.status !== "removed");
	const [writing, setWriting] = useState<string | null>(null);
	const rows = useMemo(() => (file.patch ? parsePatch(file.patch) : []), [file.patch]);
	const at = (side: string, line: number) => threads.filter((thread) => thread.side === side && thread.line === line && !thread.outdated);
	// Conversations on code that has since changed have no line here any more: they go at the top.
	const placed = new Set(rows.flatMap((row) => {
		const where = commentSide(row);
		return where ? at(where.side, where.line).map((thread) => thread.id) : [];
	}));
	const loose = threads.filter((thread) => !placed.has(thread.id));
	const unresolved = threads.filter((thread) => !thread.resolved).length;
	const name = file.previous && file.previous !== file.path ? `${file.previous} → ${file.path}` : file.path;
	const send = (row: PatchRow) => async (body: string) => {
		const where = commentSide(row)!;
		await change(item, { kind: "line-comment", path: file.path, line: where.line, side: where.side, body, commit: head });
		setWriting(null);
		onChanged();
	};
	return <section className="overflow-hidden rounded-md border">
		<button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 border-b bg-muted/40 px-3 py-2 text-left text-sm hover:bg-muted/70">
			{open ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
			<FileCode2 className="size-4 shrink-0 text-muted-foreground" />
			<span className="min-w-0 truncate font-mono text-xs">{name}</span>
			{file.status !== "modified" && <span className="shrink-0 rounded-[4px] border px-1.5 text-2xs text-muted-foreground">{file.status}</span>}
			{unresolved > 0 && <span className="flex shrink-0 items-center gap-1 text-2xs text-warning"><MessageSquarePlus className="size-3" />{unresolved} open</span>}
			<span className="flex-1" />
			<span className="shrink-0 font-mono text-2xs"><span className="text-success">+{file.additions}</span> <span className="text-destructive">-{file.deletions}</span></span>
		</button>
		{open && <div className="font-mono text-xs">
			{loose.length > 0 && <div className="border-b px-3">{loose.map((thread) => <ThreadView key={thread.id} thread={thread} item={item} onChanged={onChanged} />)}</div>}
			{!file.patch && <p className="flex items-center gap-2 px-3 py-3 font-sans text-sm text-muted-foreground">
				{file.status === "removed" ? "This file was deleted." : "GitHub doesn't show this diff here, usually because it's too big or not text."}
				<button type="button" onClick={() => openExternal(`${item.url}/files`)} className="flex items-center gap-1 text-foreground hover:underline">See it on GitHub<ArrowUpRight className="size-3" /></button>
			</p>}
			<table className="w-full border-collapse">
				<tbody>
					{rows.map((row, index) => {
						const where = commentSide(row);
						const id = `${index}`;
						const here = where ? at(where.side, where.line) : [];
						return <Fragment key={id}>
							<tr className={cn("group align-top", ROW[row.kind])}>
								<td className="w-10 px-2 text-right text-muted-foreground/70 select-none">{row.old ?? ""}</td>
								<td className="w-10 px-2 text-right text-muted-foreground/70 select-none">{row.new ?? ""}</td>
								<td className="relative w-5 select-none">
									{where && <button type="button" aria-label={`Comment on line ${where.line}`} onClick={() => setWriting(writing === id ? null : id)} className="absolute top-0 left-0 grid size-4 place-items-center rounded-[3px] bg-primary text-primary-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100"><Plus className="size-3" /></button>}
									<span className={cn("pl-1", row.kind === "add" ? "text-success" : row.kind === "remove" ? "text-destructive" : "")}>{SIGN[row.kind]}</span>
								</td>
								<td className="pr-3 break-all whitespace-pre-wrap" data-selectable>{row.text || " "}</td>
							</tr>
							{(here.length > 0 || writing === id) && <tr>
								<td colSpan={4} className="border-y bg-muted/20 px-3 py-1">
									{here.map((thread) => <ThreadView key={thread.id} thread={thread} item={item} onChanged={onChanged} />)}
									{writing === id && <div className="my-2 font-sans"><Writer autoFocus placeholder={`Comment on line ${where!.line}. Ctrl+Enter posts it; Escape cancels.`} action="Comment" onSend={send(row)} onCancel={() => setWriting(null)} /></div>}
								</td>
							</tr>}
						</Fragment>;
					})}
				</tbody>
			</table>
		</div>}
	</section>;
}

/** The Files changed tab: every file's diff, with line comments and their conversations. */
export function FilesView({ item }: { item: WorkItem }) {
	const { data, error, reload } = usePullFiles(item);
	if (!data) return <p className="py-10 text-center text-sm text-muted-foreground">{error ? `Couldn't read the files: ${error}` : "Reading the changes from GitHub…"}</p>;
	const additions = data.files.reduce((sum, file) => sum + file.additions, 0);
	const deletions = data.files.reduce((sum, file) => sum + file.deletions, 0);
	const open = data.threads.filter((thread) => !thread.resolved).length;
	return <div className="mt-4 space-y-3">
		<div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
			<span>{data.files.length} {data.files.length === 1 ? "file" : "files"} changed</span>
			<span className="font-mono text-xs"><span className="text-success">+{additions.toLocaleString("en-US")}</span> <span className="text-destructive">-{deletions.toLocaleString("en-US")}</span></span>
			{data.threads.length > 0 && <span>{open} open {open === 1 ? "conversation" : "conversations"}, {data.threads.length - open} resolved</span>}
			<span className="flex-1" />
			<span className="text-xs">Hover a line and press + to comment on it.</span>
			{error && <span className="text-xs text-destructive">{error}</span>}
		</div>
		{data.files.map((file) => <FileDiff key={file.path} file={file} threads={data.threads.filter((thread) => thread.path === file.path)} item={item} head={data.head} onChanged={reload} />)}
	</div>;
}
