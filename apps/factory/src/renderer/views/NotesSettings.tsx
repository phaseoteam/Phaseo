import { ArrowRightLeft, Check, Pencil, Pin, PinOff, Plus, TriangleAlert, Trash2, X } from "lucide-react";
import { useState } from "react";
import { COMPUTER } from "../../shared/notes";
import { stageLabel } from "../../shared/stages";
import type { FactorySnapshot, RepoNote } from "../../shared/types";
import { InlineMarkdown } from "../components/Markdown";
import { Group, SettingsPage } from "../components/Settings";
import { Button } from "../components/ui/button";
import { Tip } from "../components/ui/tooltip";
import { formatRelativeTime } from "@phaseo/app-kit/format";
import { factory, useNow } from "../lib/useFactory";
import { cn } from "../lib/utils";

/** Flagged notes first, for a decision; then pinned; then the ones that held up most. */
function order(notes: RepoNote[]): RepoNote[] {
	const score = (note: RepoNote) => (note.flagged ? 2e6 : 0) + (note.pinned ? 1e6 : 0) + (note.confirmations ?? 0) * 10 + (note.confirmedAt ?? note.updatedAt ?? note.at) / 1e11;
	return [...notes].sort((a, b) => score(b) - score(a));
}

/**
 * What agents learnt, about each repository and about this computer. Every run reads the most trusted
 * of them and says which held up; a note a run calls wrong waits here for you.
 */
export function NotesSettings({ snapshot }: { snapshot: FactorySnapshot }) {
	const now = useNow(60_000);
	const agent = (id?: string) => snapshot.agents.find((candidate) => candidate.id === id)?.label ?? id;
	const flagged = Object.values(snapshot.notes).flat().filter((note) => note.flagged).length;
	const places = [
		...snapshot.settings.repos.map(({ repo }) => ({ key: repo, title: repo, empty: "No notes yet. Agents add them as they work, or add one yourself.", placeholder: "For example: run pnpm build before the e2e tests" })),
		{ key: COMPUTER, title: "This computer", empty: "Notes about shells, tools and paths here go to every run, on any repository.", placeholder: "For example: use npm.cmd in PowerShell" },
	];
	return <SettingsPage title="Notes" description="What agents learn that the next agent would otherwise learn again: how a repository's tests run, where things live, traps on this computer. Every run reads the most trusted notes, checks the ones it relies on, and says which held up. A note a run says is wrong stops being used until you keep or remove it.">
		{flagged > 0 && <p className="mt-6 flex items-center gap-2 rounded-md border border-warning/40 bg-warning/[0.06] px-3 py-2 text-sm"><TriangleAlert className="size-4 shrink-0 text-warning" />{flagged === 1 ? "A run said one note is wrong." : `Runs said ${flagged} notes are wrong.`} They&apos;re at the top of their list.</p>}
		{places.map((place) => {
			const notes = order(snapshot.notes[place.key] ?? []);
			return <Group key={place.key} title={place.title} description={notes.length ? `${notes.length === 1 ? "1 note" : `${notes.length} notes`}. Runs get pinned notes and the ${place.key === COMPUTER ? 12 : 25} that held up most.` : place.empty}>
				{notes.map((note) => <NoteRow key={note.id} note={note} place={place.key} home={snapshot.settings.repos.length === 1 ? snapshot.settings.repos[0]!.repo : undefined} agent={agent} now={now} />)}
				<AddNote place={place.key} placeholder={place.placeholder} />
			</Group>;
		})}
	</SettingsPage>;
}

/** `home`: where a note about this computer can move back to, when there's only one repository. */
function NoteRow({ note, place, home, agent, now }: { note: RepoNote; place: string; home?: string; agent: (id?: string) => string | undefined; now: number }) {
	const moveTo = place === COMPUTER ? home : COMPUTER;
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(note.text);
	const update = (patch: Parameters<ReturnType<typeof factory>["updateNote"]>[2]) => void factory().updateNote(place, note.id, patch);
	const save = () => {
		if (draft.trim() && draft.trim() !== note.text) update({ text: draft });
		setEditing(false);
	};
	const source = note.agentId ? `${agent(note.agentId)}${note.stage ? ` in ${stageLabel(note.stage)}` : ""}` : note.previous ? "Edited by you" : "Added by you";
	return <div className={cn("group px-4 py-3", note.flagged && "border-l-2 border-l-warning bg-warning/[0.04]")}>
		{note.flagged && <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
			<TriangleAlert className="size-3.5 text-warning" />
			{note.flagged.proposed
				? <span className="min-w-0 flex-1"><span className="font-medium">{agent(note.flagged.agentId) ?? "A run"} says it now reads:</span> <InlineMarkdown source={note.flagged.proposed} /></span>
				: <span className="min-w-0 flex-1"><span className="font-medium">{agent(note.flagged.agentId) ?? "A run"} says it&apos;s wrong:</span> <InlineMarkdown source={note.flagged.why} /></span>}
			{note.flagged.proposed && <Button variant="outline" size="xs" onClick={() => update({ acceptProposed: true })}><Check className="size-3" />Use the new wording</Button>}
			<Button variant="outline" size="xs" onClick={() => update({ flagged: false })}>{note.flagged.proposed ? "Keep the original" : <><Check className="size-3" />Keep it</>}</Button>
			<Button variant="outline" size="xs" onClick={() => void factory().removeNote(place, note.id)}><Trash2 className="size-3" />Remove</Button>
		</div>}
		<div className="flex items-start gap-3">
			<div className="min-w-0 flex-1">
				{editing
					? <textarea autoFocus value={draft} rows={2} onChange={(event) => setDraft(event.target.value)} onBlur={save} onKeyDown={(event) => {
						if (event.key === "Enter" && !event.shiftKey) {
							event.preventDefault();
							save();
						}
						if (event.key === "Escape") {
							event.stopPropagation();
							setDraft(note.text);
							setEditing(false);
						}
					}} className="block w-full resize-y rounded-md border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-ring" />
					: <p data-selectable className={cn("text-sm", note.flagged && "text-muted-foreground line-through decoration-muted-foreground/40")}><InlineMarkdown source={note.text} /></p>}
				<p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-2xs text-muted-foreground">
					{note.pinned && <span className="flex items-center gap-1 font-medium text-foreground/80"><Pin className="size-3" />Pinned</span>}
					{note.pinned && <span>·</span>}
					<span>{source} · {formatRelativeTime(note.updatedAt ?? note.at, now)}</span>
					{(note.confirmations ?? 0) > 0 && <span>· held up {note.confirmations === 1 ? "once" : `${note.confirmations} times`}{note.confirmedAt ? `, last ${formatRelativeTime(note.confirmedAt, now)}` : ""}</span>}
					{note.checked && <span className="min-w-0">· checked: <InlineMarkdown source={note.checked} /></span>}
					{note.evidence && <span className="min-w-0">· last seen: <InlineMarkdown source={note.evidence} /></span>}
					{note.previous && <Tip label={`Was: ${note.previous}`}><span className="underline decoration-dotted underline-offset-2">· corrected</span></Tip>}
				</p>
			</div>
			<div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
				{editing
					? <Button variant="ghost" size="icon-xs" aria-label="Cancel" onMouseDown={(event) => event.preventDefault()} onClick={() => { setDraft(note.text); setEditing(false); }}><X className="size-3.5" /></Button>
					: <Tip label="Edit"><Button variant="ghost" size="icon-xs" aria-label="Edit note" className="text-muted-foreground" onClick={() => { setDraft(note.text); setEditing(true); }}><Pencil className="size-3.5" /></Button></Tip>}
				{moveTo && <Tip label={moveTo === COMPUTER ? "Move to this computer: every repository's runs get it" : `Move to ${moveTo}`}><Button variant="ghost" size="icon-xs" aria-label="Move note" className="text-muted-foreground" onClick={() => update({ moveTo })}><ArrowRightLeft className="size-3.5" /></Button></Tip>}
				<Tip label={note.pinned ? "Unpin" : "Pin: every run gets it"}><Button variant="ghost" size="icon-xs" aria-label={note.pinned ? "Unpin note" : "Pin note"} className="text-muted-foreground" onClick={() => update({ pinned: !note.pinned })}>{note.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}</Button></Tip>
				<Tip label="Remove"><Button variant="ghost" size="icon-xs" aria-label="Remove note" className="text-muted-foreground" onClick={() => void factory().removeNote(place, note.id)}><Trash2 className="size-3.5" /></Button></Tip>
			</div>
		</div>
	</div>;
}

function AddNote({ place, placeholder }: { place: string; placeholder: string }) {
	const [text, setText] = useState("");
	const add = () => {
		if (!text.trim()) return;
		void factory().addNote(place, text);
		setText("");
	};
	return <form className="flex items-center gap-2 px-4 py-3" onSubmit={(event) => {
		event.preventDefault();
		add();
	}}>
		<input value={text} onChange={(event) => setText(event.target.value)} placeholder={placeholder} aria-label={`Add a note to ${place === COMPUTER ? "this computer" : place}`} className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2.5 text-sm outline-none placeholder:text-muted-foreground/70 focus:border-ring" />
		<Button type="submit" variant="outline" size="sm" disabled={!text.trim()}><Plus className="size-3.5" />Add</Button>
	</form>;
}
