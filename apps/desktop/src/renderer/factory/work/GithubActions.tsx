import { ArrowUpRight, Check, ChevronDown, ChevronRight, CircleCheck, CircleDot, CircleSlash, CircleX, GitMerge, GitPullRequestClosed, GitPullRequestDraft, LoaderCircle, MessageSquare, RotateCcw, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { mentionAt } from "../../../shared/factory/mentions";
import type { CheckRun, GithubChange, Mentionable, MergeMethod, MergeState, ReviewVerdict, WorkItem } from "../../../shared/factory/types";
import { errorText } from "../components/AddRepo";
import { PersonMark } from "../components/Marks";
import { Markdown } from "../components/Markdown";
import { useImages } from "./NewIssueView";
import { Button } from "../../components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "../../components/ui/dropdown-menu";
import { factory, openExternal } from "../lib/useFactory";
import { cn } from "../../lib/utils";

/** Everything someone does to an issue or pull request on GitHub, done from here as the person gh is signed in as. */

const METHOD_LABEL: Record<MergeMethod, string> = { squash: "Squash and merge", merge: "Create a merge commit", rebase: "Rebase and merge" };
const METHOD_DETAIL: Record<MergeMethod, string> = { squash: "One commit on the base branch", merge: "Every commit, joined by a merge commit", rebase: "Every commit, replayed on the base branch" };

const isOpen = (item: WorkItem) => item.state === "open" || item.state === "draft";

/** Runs one change, keeping the button busy and the error beside it. */
function useChange(item: WorkItem) {
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const change = async (what: string, next: GithubChange): Promise<boolean> => {
		setBusy(what);
		setError(null);
		try {
			await factory().changeOnGithub(item.id, next);
			return true;
		} catch (cause) {
			setError(errorText(cause));
			return false;
		} finally {
			setBusy(null);
		}
	};
	return { busy, error, change };
}

/** The menu beside the run buttons: the state changes that don't need anything written. */
export function GithubMenu({ item }: { item: WorkItem }) {
	const { busy, error, change } = useChange(item);
	const pull = item.kind === "pull";
	const entries: { key: string; icon: ReactNode; label: string; detail: string; change: GithubChange }[] = [];
	if (pull && item.state === "draft") entries.push({ key: "ready", icon: <CircleDot className="size-3.5" />, label: "Mark ready for review", detail: "Takes it out of draft", change: { kind: "draft", draft: false } });
	if (pull && item.state === "open") entries.push({ key: "draft", icon: <GitPullRequestDraft className="size-3.5" />, label: "Convert to draft", detail: "Stops asking for reviews", change: { kind: "draft", draft: true } });
	if (pull && isOpen(item)) entries.push({ key: "update", icon: <GitMerge className="size-3.5" />, label: "Update branch", detail: "Merges the latest base branch in, on GitHub", change: { kind: "update-branch" } });
	if (pull && isOpen(item)) entries.push({ key: "close", icon: <GitPullRequestClosed className="size-3.5" />, label: "Close pull request", detail: "Without merging; it can be reopened", change: { kind: "close" } });
	if (!pull && item.state === "open") {
		entries.push({ key: "completed", icon: <CircleCheck className="size-3.5" />, label: "Close as completed", detail: "Done, fixed or answered", change: { kind: "close", reason: "completed" } });
		entries.push({ key: "not-planned", icon: <CircleSlash className="size-3.5" />, label: "Close as not planned", detail: "Won't fix, can't reproduce or stale", change: { kind: "close", reason: "not planned" } });
	}
	if (item.state === "closed") entries.push({ key: "reopen", icon: <CircleDot className="size-3.5" />, label: pull ? "Reopen pull request" : "Reopen issue", detail: "Puts it back in the list", change: { kind: "reopen" } });
	if (!entries.length) return null;
	return <div className="flex flex-col items-end">
		<DropdownMenu>
			<DropdownMenuTrigger render={<Button variant="outline" disabled={!!busy}>{busy ? "Changing…" : "GitHub"}<ChevronDown className="size-3.5" /></Button>} />
			<DropdownMenuContent align="end" className="w-64">
				<DropdownMenuGroup>
					<DropdownMenuLabel>On GitHub, as you</DropdownMenuLabel>
					{entries.map((entry) => <DropdownMenuItem key={entry.key} onClick={() => void change(entry.key, entry.change)}>
						{entry.icon}
						<span className="min-w-0 flex-1">
							<span className="block">{entry.label}</span>
							<span className="block text-2xs text-muted-foreground">{entry.detail}</span>
						</span>
					</DropdownMenuItem>)}
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
		{error && <p className="mt-1 max-w-64 text-right text-xs text-destructive">{error}</p>}
	</div>;
}

/** Where a pull request stands for merging, and the button that merges it once it can be. */
export function MergeBox({ item }: { item: WorkItem }) {
	const [state, setState] = useState<{ key: string; merge: MergeState | null; error: string | null }>({ key: "", merge: null, error: null });
	const [asked, setAsked] = useState(0);
	const [method, setMethod] = useState<MergeMethod | null>(null);
	const [confirming, setConfirming] = useState(false);
	const [fixing, setFixing] = useState(false);
	const [fixError, setFixError] = useState<string | null>(null);
	const { busy, error, change } = useChange(item);
	const key = `${item.id}@${item.updatedAt}@${item.ci?.checkedAt ?? 0}@${asked}`;
	useEffect(() => {
		let current = true;
		void factory().mergeState(item.id)
			.then((merge) => current && setState({ key, merge, error: null }))
			.catch((cause: unknown) => current && setState({ key, merge: null, error: errorText(cause) }));
		return () => {
			current = false;
		};
	}, [item.id, key]);
	// A pull request that's still being worked out by GitHub is asked again shortly, and again, until it says.
	useEffect(() => {
		if (!state.merge?.checking) return;
		const timer = setTimeout(() => setAsked((count) => count + 1), 4_000);
		return () => clearTimeout(timer);
	}, [state.merge?.checking, state.key]);
	useEffect(() => {
		if (!confirming) return;
		const timer = setTimeout(() => setConfirming(false), 6_000);
		return () => clearTimeout(timer);
	}, [confirming]);
	if (!isOpen(item)) return null;
	const merge = state.merge;
	const chosen = merge && (method && merge.methods.includes(method) ? method : merge.preferred);
	const ci = item.ci;
	let tone: "ok" | "warn" | "blocked" | "wait" = "wait";
	let title = "Checking whether it can merge…";
	let detail: string | undefined;
	if (state.error) {
		tone = "blocked";
		title = "Couldn't check whether it can merge";
		detail = state.error;
	} else if (merge?.blocker) {
		tone = "blocked";
		title = merge.blocker;
	} else if (merge?.checking) {
		title = "GitHub is checking for conflicts…";
	} else if (merge) {
		tone = merge.unstable || ci?.state === "failed" || ci?.state === "pending" ? "warn" : "ok";
		title = ci?.state === "failed" ? `It can merge, but ${ci.failed.length === 1 ? "a check" : `${ci.failed.length} checks`} failed` : ci?.state === "pending" || merge.unstable ? "It can merge, though checks are still running or failed" : "Ready to merge";
		detail = merge.deletesBranch ? "GitHub deletes the branch once it's merged." : undefined;
	}
	const icon = tone === "ok" ? <Check className="size-4 text-success" /> : tone === "warn" ? <TriangleAlert className="size-4 text-warning" /> : tone === "blocked" ? <TriangleAlert className="size-4 text-destructive" /> : <GitMerge className="size-4 text-muted-foreground" />;
	const canMerge = !!merge && !merge.blocker && !merge.checking && !!chosen;
	const fixConflicts = async () => {
		setFixing(true);
		setFixError(null);
		try {
			await factory().act(item.id, { id: "fix-conflicts", label: "Fix conflicts" });
		} catch (cause) {
			setFixError(errorText(cause));
		} finally {
			setFixing(false);
		}
	};
	if (merge?.conflicts && !detail) detail = `An agent can merge ${merge.base} into this branch, resolve the conflicts, run the tests and push the result. Factory never force-pushes.`;
	const doMerge = async () => {
		if (!chosen) return;
		if (!confirming) return setConfirming(true);
		setConfirming(false);
		await change("merge", { kind: "merge", method: chosen });
	};
	return <div className="rounded-md border">
		<div className="flex items-start gap-3 px-4 py-3">
			<span className="mt-0.5 shrink-0">{icon}</span>
			<div className="min-w-0 flex-1">
				<div className="text-sm font-medium">{title}</div>
				{detail && <div className="mt-0.5 text-xs text-muted-foreground">{detail}</div>}
			</div>
			{item.state === "draft" && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => void change("ready", { kind: "draft", draft: false })}>{busy === "ready" ? "Marking ready…" : "Mark ready for review"}</Button>}
			{merge?.conflicts && <Button size="sm" disabled={!!busy || fixing} onClick={() => void fixConflicts()}>{fixing ? "Starting…" : "Fix conflicts with an agent"}</Button>}
			{merge && !merge.conflicts && merge.behind && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => void change("update", { kind: "update-branch" })}>{busy === "update" ? "Updating…" : `Update branch from ${merge.base}`}</Button>}
			{merge && merge.methods.length > 0 && <div className="flex shrink-0">
				<Button size="sm" variant={canMerge ? "default" : "outline"} disabled={!canMerge || !!busy} onClick={() => void doMerge()} className={cn(merge.methods.length > 1 && "rounded-r-none")}>
					<GitMerge className="size-3.5" />
					{busy === "merge" ? "Merging…" : confirming ? `Click again to ${METHOD_LABEL[chosen!].toLowerCase()}` : METHOD_LABEL[chosen!]}
				</Button>
				{merge.methods.length > 1 && <DropdownMenu>
					<DropdownMenuTrigger render={<Button size="sm" variant={canMerge ? "default" : "outline"} disabled={!!busy} aria-label="Choose how to merge" className="rounded-l-none border-l border-l-primary-foreground/25 px-1.5"><ChevronDown className="size-3.5" /></Button>} />
					<DropdownMenuContent align="end" className="w-64">
						<DropdownMenuGroup>
							{merge.methods.map((option) => <DropdownMenuItem key={option} onClick={() => {
								setMethod(option);
								setConfirming(false);
							}}>
								<Check className={cn("size-3.5", option !== chosen && "invisible")} />
								<span className="min-w-0 flex-1">
									<span className="block">{METHOD_LABEL[option]}</span>
									<span className="block text-2xs text-muted-foreground">{METHOD_DETAIL[option]}</span>
								</span>
							</DropdownMenuItem>)}
						</DropdownMenuGroup>
					</DropdownMenuContent>
				</DropdownMenu>}
			</div>}
		</div>
		{(error || fixError) && <p className="border-t px-4 py-2 text-xs text-destructive">{error ?? fixError}</p>}
	</div>;
}


/** People to suggest for "@": those in this conversation first, then whoever GitHub lets you mention. */
function useMentions(item: WorkItem, people: Mentionable[], query: string | null): Mentionable[] {
	const [remote, setRemote] = useState<{ query: string; people: Mentionable[] }>({ query: "", people: [] });
	useEffect(() => {
		if (query === null) return;
		let current = true;
		// Asked once typing pauses, not on every key.
		const timer = setTimeout(() => void factory().mentions(item.id, query).then((found) => current && setRemote({ query, people: found })).catch(() => undefined), 150);
		return () => {
			current = false;
			clearTimeout(timer);
		};
	}, [item.id, query]);
	if (query === null) return [];
	const typed = query.toLowerCase();
	const matches = (person: Mentionable) => !typed || person.login.toLowerCase().startsWith(typed) || !!person.name?.toLowerCase().split(/\s+/).some((word) => word.startsWith(typed));
	// GitHub's answer for an earlier, shorter query still helps while the new one is on its way.
	const fromGithub = remote.query && !typed.startsWith(remote.query.toLowerCase()) ? [] : remote.people.filter(matches);
	const seen = new Set<string>();
	return [...people.filter(matches), ...fromGithub].filter((person) => {
		const key = person.login.toLowerCase();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	}).map((person) => ({ ...fromGithub.find((other) => other.login.toLowerCase() === person.login.toLowerCase()), ...person, name: person.name ?? fromGithub.find((other) => other.login.toLowerCase() === person.login.toLowerCase())?.name })).slice(0, 8);
}

const CHECK = {
	pass: { icon: CircleCheck, className: "text-success", label: "Passed" },
	fail: { icon: CircleX, className: "text-destructive", label: "Failed" },
	pending: { icon: LoaderCircle, className: "animate-spin text-info [animation-duration:1.6s]", label: "Running" },
	skipped: { icon: CircleSlash, className: "text-muted-foreground", label: "Skipped" },
	cancelled: { icon: CircleSlash, className: "text-muted-foreground", label: "Cancelled" },
} as const;

/** One check, and for a failed GitHub Actions job, the end of its log on request. */
function CheckRow({ check, item }: { check: CheckRun; item: WorkItem }) {
	const [log, setLog] = useState<{ open: boolean; text: string | null; loading: boolean }>({ open: false, text: null, loading: false });
	const look = CHECK[check.state];
	const Icon = look.icon;
	const actions = !!check.link?.includes("/actions/runs/");
	const why = async () => {
		if (log.open) return setLog({ ...log, open: false });
		setLog({ open: true, text: log.text, loading: log.text === null });
		if (log.text !== null) return;
		const text = await factory().checkLog(item.id, check.link!).catch(() => null);
		setLog({ open: true, text: text ?? "", loading: false });
	};
	return <div className="px-4 py-2">
		<div className="flex items-center gap-2 text-sm">
			<Icon className={cn("size-4 shrink-0", look.className)} />
			<span className="min-w-0 truncate">{check.workflow && check.workflow !== check.name ? <span className="text-muted-foreground">{check.workflow} / </span> : null}{check.name}</span>
			{check.description && <span className="min-w-0 truncate text-xs text-muted-foreground">{check.description}</span>}
			<span className="flex-1" />
			{check.seconds !== undefined && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{check.seconds < 60 ? `${check.seconds}s` : `${Math.floor(check.seconds / 60)}m ${check.seconds % 60}s`}</span>}
			{check.state === "fail" && actions && <button type="button" onClick={() => void why()} className="shrink-0 text-xs text-muted-foreground hover:text-foreground">{log.open ? "Hide log" : "Why it failed"}</button>}
			{check.link && <button type="button" onClick={() => openExternal(check.link!)} className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Details<ArrowUpRight className="size-3" /></button>}
		</div>
		{log.open && <pre ref={(node) => {
			// The error is at the end of a log: open there.
			if (node) node.scrollTop = node.scrollHeight;
		}} data-selectable className="mt-2 max-h-72 overflow-auto rounded-md border bg-muted/40 p-2.5 font-mono text-2xs leading-relaxed whitespace-pre-wrap">
			{log.loading ? "Reading the log…" : log.text ? log.text.split("\n").slice(-60).join("\n") : "GitHub has no log for this job, or it's still being written."}
		</pre>}
	</div>;
}

/** Every check on a pull request, read again while any are running, with a way to re-run the failed ones. */
export function ChecksBox({ item }: { item: WorkItem }) {
	const [state, setState] = useState<{ key: string; checks: CheckRun[] | null; error: string | null }>({ key: "", checks: null, error: null });
	const [tick, setTick] = useState(0);
	const [open, setOpen] = useState<boolean | null>(null);
	const { busy, error, change } = useChange(item);
	const key = `${item.id}@${item.updatedAt}@${item.ci?.checkedAt ?? 0}@${tick}`;
	useEffect(() => {
		let current = true;
		void factory().itemChecks(item.id)
			.then((checks) => current && setState({ key, checks, error: null }))
			.catch((cause: unknown) => current && setState((previous) => ({ key, checks: previous.checks, error: errorText(cause) })));
		return () => {
			current = false;
		};
	}, [item.id, key]);
	const checks = state.checks;
	const running = checks?.some((check) => check.state === "pending");
	useEffect(() => {
		if (!running) return;
		const timer = setTimeout(() => setTick((count) => count + 1), 15_000);
		return () => clearTimeout(timer);
	}, [running, state.key]);
	if (!checks) return state.error ? <p className="text-xs text-destructive">Couldn&apos;t read the checks: {state.error}</p> : null;
	if (!checks.length) return null;
	const failed = checks.filter((check) => check.state === "fail");
	const passed = checks.filter((check) => check.state === "pass").length;
	const pending = checks.filter((check) => check.state === "pending").length;
	const shown = open ?? failed.length > 0;
	const order = { fail: 0, pending: 1, pass: 2, cancelled: 3, skipped: 4 } as const;
	const sorted = [...checks].sort((a, b) => order[a.state] - order[b.state] || a.name.localeCompare(b.name));
	const rerunnable = failed.map((check) => check.link).filter((link): link is string => !!link?.includes("/actions/runs/"));
	const summary = [failed.length && `${failed.length} failed`, pending && `${pending} running`, passed && `${passed} passed`].filter(Boolean).join(", ");
	const SummaryIcon = failed.length ? CHECK.fail : pending ? CHECK.pending : CHECK.pass;
	return <div className="rounded-md border">
		<div className="flex items-center gap-3 px-4 py-2.5">
			<button type="button" onClick={() => setOpen(!shown)} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm">
				<SummaryIcon.icon className={cn("size-4 shrink-0", SummaryIcon.className)} />
				<span className="font-medium">{checks.length === 1 ? "1 check" : `${checks.length} checks`}</span>
				<span className="truncate text-muted-foreground">{summary}</span>
				{shown ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
			</button>
			{rerunnable.length > 0 && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => void change("rerun", { kind: "rerun-checks", links: rerunnable }).then((ok) => ok && setTick((count) => count + 1))}>
				<RotateCcw className="size-3.5" />{busy === "rerun" ? "Starting…" : failed.length === 1 ? "Re-run the failed check" : "Re-run failed checks"}
			</Button>}
		</div>
		{error && <p className="border-t px-4 py-2 text-xs text-destructive">{error}</p>}
		{shown && <div className="divide-y border-t">{sorted.map((check) => <CheckRow key={`${check.workflow}/${check.name}`} check={check} item={item} />)}</div>}
	</div>;
}

/** A comment for GitHub, which can also close, reopen or review in the same go, like GitHub's own box. Typing "@" suggests people. */
const draftKey = (itemId: string) => `factory.comment-draft.${itemId}`;

export function CommentBox({ item, login, people = [] }: { item: WorkItem; login?: string; people?: Mentionable[] }) {
	// What was typed but not sent stays, per item, until it's sent or cleared.
	const [text, setText] = useState(() => localStorage.getItem(draftKey(item.id)) ?? "");
	useEffect(() => {
		if (text) localStorage.setItem(draftKey(item.id), text);
		else localStorage.removeItem(draftKey(item.id));
	}, [item.id, text]);
	const [preview, setPreview] = useState(false);
	const [imageError, setImageError] = useState<string | null>(null);
	const pasted = useImages(setImageError);
	const [caret, setCaret] = useState(0);
	const [picked, setPicked] = useState(0);
	// Escape hides the suggestions until the "@" being typed changes.
	const [dismissed, setDismissed] = useState<number | null>(null);
	const area = useRef<HTMLTextAreaElement>(null);
	// GitHub doesn't let people approve their own pull requests.
	const own = !!login && login.toLowerCase() === item.author.login.toLowerCase();
	const { busy, error, change } = useChange(item);
	const body = text.trim();
	const pull = item.kind === "pull";
	const mention = mentionAt(text, caret);
	const open = mention && dismissed !== mention.start ? mention : null;
	const suggestions = useMentions(item, people, open?.query ?? null);
	const showing = !!open && suggestions.length > 0;
	const send = async (what: string, next: GithubChange) => {
		const images = await Promise.all(pasted.list.map(async ({ file }) => ({ name: file.name, type: file.type, data: new Uint8Array(await file.arrayBuffer()) })));
		const withImages = images.length && (next.kind === "comment" || next.kind === "close" || next.kind === "reopen") ? { ...next, images } : next;
		if (await change(what, withImages)) {
			setText("");
			setPreview(false);
			for (const image of pasted.list) pasted.remove(image.id);
		}
	};
	const sendable = !!body || pasted.list.length > 0;
	const choose = (person: Mentionable) => {
		if (!open) return;
		const next = `${text.slice(0, open.start)}@${person.login} ${text.slice(caret)}`;
		const at = open.start + person.login.length + 2;
		setText(next);
		setCaret(at);
		setPicked(0);
		requestAnimationFrame(() => {
			area.current?.focus();
			area.current?.setSelectionRange(at, at);
		});
	};
	const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (showing) {
			const move = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
			if (move) {
				event.preventDefault();
				setPicked((index) => (index + move + suggestions.length) % suggestions.length);
				return;
			}
			if ((event.key === "Enter" && !event.ctrlKey && !event.metaKey) || event.key === "Tab") {
				event.preventDefault();
				choose(suggestions[Math.min(picked, suggestions.length - 1)]!);
				return;
			}
			if (event.key === "Escape") {
				event.preventDefault();
				setDismissed(open.start);
				return;
			}
		}
		// Ctrl+Enter comments, as on GitHub; Enter alone starts a new line.
		if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && sendable) {
			event.preventDefault();
			void send("comment", { kind: "comment", body });
		}
	};
	const review = (verdict: ReviewVerdict) => void send(verdict, { kind: "review", verdict, body });
	const track = () => setCaret(area.current?.selectionStart ?? 0);
	return <div className="relative rounded-md border focus-within:border-ring" onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
		event.preventDefault();
		pasted.add(event.dataTransfer.files);
	}}>
		{preview ? <div className="min-h-[86px] px-3 py-2.5">{body ? <Markdown source={text} repo={item.repo} /> : <p className="text-sm text-muted-foreground">Nothing to preview.</p>}</div> : <textarea
			ref={area}
			onPaste={pasted.onPaste}
			value={text}
			rows={Math.min(12, Math.max(3, text.split("\n").length))}
			onChange={(event) => {
				setText(event.target.value);
				setCaret(event.target.selectionStart);
				setPicked(0);
			}}
			onKeyDown={onKey}
			onKeyUp={(event) => (event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End") && !showing && track()}
			onClick={track}
			onBlur={() => setTimeout(() => setDismissed(mentionAt(area.current?.value ?? "", area.current?.selectionStart ?? 0)?.start ?? null), 120)}
			onFocus={() => setDismissed(null)}
			placeholder={`Leave a comment on #${item.number}. Markdown works, @ mentions someone, Ctrl+Enter posts it.`}
			aria-autocomplete="list"
			aria-expanded={showing}
			className="block w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
		/>}
		{pasted.list.length > 0 && <div className="flex flex-wrap gap-2 px-3 pb-2.5">
			{pasted.list.map((image, index) => <figure key={image.id} className="group relative size-16 overflow-hidden rounded-md border bg-muted">
				<img src={image.url} alt="" className="size-full object-cover" />
				<button type="button" aria-label={`Remove image ${index + 1}`} onClick={() => pasted.remove(image.id)} className="absolute top-0.5 right-0.5 grid size-5 place-items-center rounded-[4px] bg-background/90 text-muted-foreground opacity-0 shadow-sm group-hover:opacity-100 hover:text-foreground focus-visible:opacity-100"><X className="size-3" /></button>
			</figure>)}
		</div>}
		{showing && <div role="listbox" aria-label="People to mention" className="absolute top-full left-2 z-30 mt-1 w-72 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
			{suggestions.map((person, index) => <button
				key={person.login}
				type="button"
				role="option"
				aria-selected={index === picked}
				// Keeps the textarea focused, so the caret stays where the name goes.
				onMouseDown={(event) => event.preventDefault()}
				onClick={() => choose(person)}
				onMouseEnter={() => setPicked(index)}
				className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm", index === picked && "bg-accent")}
			>
				<PersonMark login={person.login} avatar={person.avatar} className="size-5" />
				<span className="truncate font-medium">{person.login}</span>
				{person.name && <span className="min-w-0 truncate text-xs text-muted-foreground">{person.name}</span>}
			</button>)}
		</div>}
		<div className="flex flex-wrap items-center justify-end gap-2 border-t px-2 py-2">
			<button type="button" onClick={() => setPreview(!preview)} className="pl-1 text-xs text-muted-foreground hover:text-foreground">{preview ? "Write" : "Preview"}</button>
			<span className="hidden text-2xs text-muted-foreground/70 @lg:inline">Paste or drop images</span>
			<span className="mr-auto" />
			{(error || imageError) && <p className="w-full pl-1 text-xs text-destructive">{error ?? imageError}</p>}
			{pull && isOpen(item) && <DropdownMenu>
				<DropdownMenuTrigger render={<Button variant="outline" size="sm" disabled={!!busy || pasted.list.length > 0} title={pasted.list.length ? "A review can't carry images: post them as a comment" : undefined}>{busy && busy !== "comment" && busy !== "close" && busy !== "reopen" ? "Reviewing…" : "Review"}<ChevronDown className="size-3.5" /></Button>} />
				<DropdownMenuContent align="end" className="w-64">
					<DropdownMenuGroup>
						<DropdownMenuLabel>Review, with the comment above</DropdownMenuLabel>
						<DropdownMenuItem disabled={own} onClick={() => review("approve")}>
							<Check className="size-3.5 text-success" />
							<span className="min-w-0 flex-1"><span className="block">Approve</span><span className="block text-2xs text-muted-foreground">{own ? "GitHub doesn't let you approve your own" : "The comment is optional"}</span></span>
						</DropdownMenuItem>
						<DropdownMenuItem disabled={!body || own} onClick={() => review("request-changes")}>
							<TriangleAlert className="size-3.5 text-warning" />
							<span className="min-w-0 flex-1"><span className="block">Request changes</span><span className="block text-2xs text-muted-foreground">{own ? "Not on your own pull request" : "Say what needs to change above"}</span></span>
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem disabled={!body} onClick={() => review("comment")}>
							<MessageSquare className="size-3.5" />
							<span className="min-w-0 flex-1"><span className="block">Comment as a review</span><span className="block text-2xs text-muted-foreground">Neither approves nor blocks</span></span>
						</DropdownMenuItem>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>}
			{isOpen(item) && (pull
				? <Button variant="outline" size="sm" disabled={!!busy} onClick={() => void send("close", { kind: "close", body })}>
					<GitPullRequestClosed className="size-3.5" />{busy === "close" ? "Closing…" : body ? "Close with comment" : "Close pull request"}
				</Button>
				: <div className="flex">
					<Button variant="outline" size="sm" disabled={!!busy} className="rounded-r-none" onClick={() => void send("close", { kind: "close", reason: "completed", body })}>
						<CircleCheck className="size-3.5" />{busy === "close" ? "Closing…" : body ? "Close with comment" : "Close issue"}
					</Button>
					<DropdownMenu>
						<DropdownMenuTrigger render={<Button variant="outline" size="sm" disabled={!!busy} aria-label="Close another way" className="rounded-l-none border-l-0 px-1.5"><ChevronDown className="size-3.5" /></Button>} />
						<DropdownMenuContent align="end" className="w-60">
							<DropdownMenuGroup>
								<DropdownMenuItem onClick={() => void send("close", { kind: "close", reason: "completed", body })}><CircleCheck className="size-3.5" />Close as completed</DropdownMenuItem>
								<DropdownMenuItem onClick={() => void send("close", { kind: "close", reason: "not planned", body })}><CircleSlash className="size-3.5" />Close as not planned</DropdownMenuItem>
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>)}
			{item.state === "closed" && <Button variant="outline" size="sm" disabled={!!busy} onClick={() => void send("reopen", { kind: "reopen", body })}>
				<CircleDot className="size-3.5" />{busy === "reopen" ? "Reopening…" : body ? "Reopen with comment" : pull ? "Reopen pull request" : "Reopen issue"}
			</Button>}
			<Button size="sm" disabled={!sendable || !!busy} onClick={() => void send("comment", { kind: "comment", body })}>{busy === "comment" ? "Posting…" : "Comment"}</Button>
		</div>
	</div>;
}
