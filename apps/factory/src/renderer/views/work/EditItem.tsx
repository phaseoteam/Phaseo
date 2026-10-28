import { Check, Pencil, Settings2 } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { GithubChange, Mentionable, RepoLabel, WorkItem } from "../../../shared/types";
import { errorText } from "../../components/AddRepo";
import { LabelChip } from "../../components/LabelChip";
import { PersonMark } from "../../components/Marks";
import { Markdown } from "../../components/Markdown";
import { Button } from "../../components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { factory } from "../../lib/useFactory";
import { cn } from "../../lib/utils";

/** Editing an issue or pull request's title, description, labels, assignees and reviewers, on GitHub. */

function useSave(item: WorkItem) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const save = async (change: GithubChange): Promise<boolean> => {
		setBusy(true);
		setError(null);
		try {
			await factory().changeOnGithub(item.id, change);
			return true;
		} catch (cause) {
			setError(errorText(cause));
			return false;
		} finally {
			setBusy(false);
		}
	};
	return { busy, error, save };
}

/** The title, with a pencil to edit it in place. */
export function TitleEditor({ item, children }: { item: WorkItem; children: ReactNode }) {
	const [draft, setDraft] = useState<string | null>(null);
	const { busy, error, save } = useSave(item);
	if (draft === null) return <div className="group mt-5 flex items-start gap-2">
		{children}
		<button type="button" aria-label="Edit the title" title="Edit the title" onClick={() => setDraft(item.title)} className="mt-1.5 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent/60 hover:text-foreground focus-visible:opacity-100"><Pencil className="size-4" /></button>
	</div>;
	const submit = async () => {
		if (draft.trim() === item.title) return setDraft(null);
		if (await save({ kind: "edit", title: draft })) setDraft(null);
	};
	return <div className="mt-5">
		<div className="flex items-center gap-2">
			<input autoFocus aria-label="Title" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => {
				if (event.key === "Enter") void submit();
				if (event.key === "Escape") setDraft(null);
			}} className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-lg font-semibold outline-none focus:border-ring" />
			<Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
			<Button disabled={busy || !draft.trim()} onClick={() => void submit()}>{busy ? "Saving…" : "Save"}</Button>
		</div>
		{error && <p className="mt-1.5 text-xs text-destructive">{error}</p>}
	</div>;
}

/** Write and Preview, as on GitHub: the same Markdown the item will show. */
export function MarkdownField({ value, onChange, repo, placeholder, rows = 8, autoFocus, onKeyDown }: { value: string; onChange: (value: string) => void; repo: string; placeholder?: string; rows?: number; autoFocus?: boolean; onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void }) {
	const [preview, setPreview] = useState(false);
	return <div>
		<div className="flex gap-1 border-b px-2 pt-1.5">
			{(["Write", "Preview"] as const).map((tab) => <button key={tab} type="button" onClick={() => setPreview(tab === "Preview")} className={cn("-mb-px rounded-t-md px-2.5 py-1 text-xs", (tab === "Preview") === preview ? "border-x border-t bg-background font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>{tab}</button>)}
		</div>
		{preview
			? <div className="min-h-24 px-3 py-2.5">{value.trim() ? <Markdown source={value} repo={repo} /> : <p className="text-sm text-muted-foreground">Nothing to preview.</p>}</div>
			: <textarea autoFocus={autoFocus} value={value} placeholder={placeholder} rows={Math.min(24, Math.max(rows, value.split("\n").length))} onChange={(event) => onChange(event.target.value)} onKeyDown={onKeyDown} className="block w-full resize-y bg-transparent px-3 py-2.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground" />}
	</div>;
}

/** The description, with Edit beside its heading. */
export function DescriptionEditor({ item, body, children }: { item: WorkItem; body: string | null; children: ReactNode }) {
	const [draft, setDraft] = useState<string | null>(null);
	const { busy, error, save } = useSave(item);
	return <>
		<div className="mb-3 flex items-center gap-2">
			<h2 className="text-sm font-semibold">Description</h2>
			{draft === null && body !== null && <button type="button" onClick={() => setDraft(body)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Pencil className="size-3" />Edit</button>}
		</div>
		{draft === null ? children : <div className="rounded-md border focus-within:border-ring">
			<MarkdownField autoFocus value={draft} onChange={setDraft} repo={item.repo} rows={10} placeholder="Describe it. Markdown works." onKeyDown={(event) => {
				if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) void save({ kind: "edit", body: draft }).then((ok) => ok && setDraft(null));
			}} />
			<div className="flex items-center justify-end gap-2 border-t px-2 py-2">
				{error && <p className="mr-auto pl-1 text-xs text-destructive">{error}</p>}
				<Button variant="ghost" size="sm" onClick={() => setDraft(null)}>Cancel</Button>
				<Button size="sm" disabled={busy || draft === body} onClick={() => void save({ kind: "edit", body: draft }).then((ok) => ok && setDraft(null))}>{busy ? "Saving…" : "Save"}</Button>
			</div>
		</div>}
	</>;
}

/**
 * A list to tick things on and off. Changes are sent once it closes, in one go, the way GitHub's own
 * sidebar does it, so a few clicks make one change on the item rather than several.
 */
function Picker<T extends { key: string }>({ title, heading, trigger, chosen, load, render, onDone, search }: {
	/** What it edits, for its button: "Assignees". */
	title: string;
	/** What its list is headed, if not the title: "Assign people". */
	heading?: string;
	trigger: ReactNode;
	chosen: string[];
	load: (query: string) => Promise<T[]>;
	render: (option: T) => ReactNode;
	onDone: (add: string[], remove: string[]) => void;
	search: string;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [picked, setPicked] = useState<string[]>(chosen);
	const [options, setOptions] = useState<T[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		if (!open) return;
		let current = true;
		const timer = setTimeout(() => void load(query).then((found) => current && setOptions(found)).catch((cause: unknown) => current && setError(errorText(cause))), 150);
		return () => {
			current = false;
			clearTimeout(timer);
		};
	}, [open, query]);
	const close = (next: boolean) => {
		if (next) {
			setPicked(chosen);
			setQuery("");
			setError(null);
		} else {
			const add = picked.filter((key) => !chosen.includes(key));
			const remove = chosen.filter((key) => !picked.includes(key));
			if (add.length || remove.length) onDone(add, remove);
		}
		setOpen(next);
	};
	const toggle = (key: string) => setPicked((current) => (current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]));
	return <Popover open={open} onOpenChange={close}>
		<PopoverTrigger render={<button type="button" aria-label={`Edit ${title.toLowerCase()}`} className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground data-popup-open:bg-accent">{trigger}</button>} />
		<PopoverContent align="end" className="w-72 gap-0 overflow-hidden p-0">
			<div className="border-b px-3 py-2 text-xs font-medium">{heading ?? title}</div>
			<input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={search} className="h-9 w-full border-b bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground" />
			<div className="max-h-72 overflow-y-auto p-1">
				{error && <p className="px-2 py-2 text-xs text-destructive">{error}</p>}
				{!options && !error && <p className="px-2 py-2 text-xs text-muted-foreground">Loading…</p>}
				{options?.length === 0 && <p className="px-2 py-2 text-xs text-muted-foreground">Nothing matches.</p>}
				{options?.map((option) => <button key={option.key} type="button" onClick={() => toggle(option.key)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent">
					<Check className={cn("size-3.5 shrink-0", !picked.includes(option.key) && "invisible")} />
					{render(option)}
				</button>)}
			</div>
			<p className="border-t px-3 py-1.5 text-2xs text-muted-foreground">Changes go to GitHub when this closes.</p>
		</PopoverContent>
	</Popover>;
}

function SidebarRow({ label, edit, children }: { label: string; edit: ReactNode; children: ReactNode }) {
	return <div className="grid grid-cols-[96px_1fr_auto] items-start gap-3 py-1.5 text-sm">
		<dt className="text-muted-foreground">{label}</dt>
		<dd className="min-w-0">{children}</dd>
		<div className="-my-0.5">{edit}</div>
	</div>;
}

/** Labels, in their colours, with a picker of the repository's labels. */
export function LabelsDetail({ item }: { item: WorkItem }) {
	const { error, save } = useSave(item);
	const [labels, setLabels] = useState<RepoLabel[] | null>(null);
	const colours = useMemo(() => ({ ...Object.fromEntries((labels ?? []).map((label) => [label.name, label.color])), ...item.labelColors }), [labels, item.labelColors]);
	const load = async (query: string) => {
		const all = labels ?? (await factory().repoLabels(item.id));
		if (!labels) setLabels(all);
		const typed = query.trim().toLowerCase();
		// The ones on the item first, then the rest in GitHub's order.
		return [...all].sort((a, b) => Number(item.labels.includes(b.name)) - Number(item.labels.includes(a.name)))
			.filter((label) => !typed || label.name.toLowerCase().includes(typed))
			.map((label) => ({ ...label, key: label.name }));
	};
	return <>
		<SidebarRow label="Labels" edit={<Picker title="Labels" search="Filter labels" trigger={<Settings2 className="size-3.5" />} chosen={item.labels} load={load}
			render={(label) => <span className="min-w-0 flex-1"><LabelChip name={label.name} color={label.color} /><span className="mt-0.5 block truncate text-2xs text-muted-foreground">{label.description}</span></span>}
			onDone={(add, remove) => void save({ kind: "labels", add, remove })} />}>
			{item.labels.length ? <span className="flex flex-wrap gap-1">{item.labels.map((label) => <LabelChip key={label} name={label} color={colours[label]} />)}</span> : <span className="text-muted-foreground">None</span>}
		</SidebarRow>
		{error && <p className="-mt-1 pb-1 text-xs text-destructive">{error}</p>}
	</>;
}

const REVIEW_MARK = { requested: "Asked", approved: "Approved", changes: "Changes requested", commented: "Commented", dismissed: "Dismissed" } as const;

/** Assignees, or a pull request's reviewers, with a picker of people who can be. */
export function PeopleDetail({ item, what }: { item: WorkItem; what: "assignees" | "reviewers" }) {
	const { error, save } = useSave(item);
	const people = what === "assignees" ? (item.assignees ?? []) : (item.reviewers ?? []);
	const chosen = what === "assignees" ? people.map((person) => person.login) : (item.reviewers ?? []).filter((person) => person.state === "requested").map((person) => person.login);
	const load = async (query: string) => {
		const found: Mentionable[] = await factory().assignable(item.id, query);
		const typed = query.trim().toLowerCase();
		const current = people.filter((person) => !typed || person.login.toLowerCase().startsWith(typed));
		const seen = new Set<string>();
		return [...current, ...found]
			// Nobody reviews their own pull request.
			.filter((person) => what !== "reviewers" || person.login.toLowerCase() !== item.author.login.toLowerCase())
			.filter((person) => (seen.has(person.login.toLowerCase()) ? false : (seen.add(person.login.toLowerCase()), true)))
			.map((person) => ({ ...person, key: person.login }));
	};
	return <>
		<SidebarRow label={what === "assignees" ? "Assignees" : "Reviewers"} edit={<Picker title={what === "assignees" ? "Assignees" : "Reviewers"} heading={what === "assignees" ? "Assign people" : "Ask for reviews"} search="Type a name" trigger={<Settings2 className="size-3.5" />} chosen={chosen} load={load}
			render={(person) => <><PersonMark login={person.login} avatar={"avatar" in person ? person.avatar : undefined} className="size-5" /><span className="truncate font-medium">{person.login}</span>{"name" in person && person.name ? <span className="min-w-0 truncate text-xs text-muted-foreground">{person.name}</span> : null}</>}
			onDone={(add, remove) => void save({ kind: what, add, remove })} />}>
			{people.length ? <span className="flex flex-col gap-1">{people.map((person) => <span key={person.login} className="flex min-w-0 items-center gap-1.5">
				<PersonMark login={person.login} avatar={person.avatar} className="size-4" />
				<span className="truncate">{person.login}</span>
				{"state" in person && <span className={cn("shrink-0 text-2xs", person.state === "approved" ? "text-success" : person.state === "changes" ? "text-warning" : "text-muted-foreground")}>{REVIEW_MARK[person.state]}</span>}
			</span>)}</span> : <span className="text-muted-foreground">{what === "assignees" ? "Nobody" : "None asked"}</span>}
		</SidebarRow>
		{error && <p className="-mt-1 pb-1 text-xs text-destructive">{error}</p>}
	</>;
}
