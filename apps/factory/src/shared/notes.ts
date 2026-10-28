import { words } from "./similar";
import type { NoteCheck, NoteScope, RepoNote, Run, RunReport } from "./types";

/**
 * Notes are what agents learn that the next agent would otherwise learn again: how a repository's
 * tests run, where things live, traps on this computer. Each run sees them with a short label (R1 for
 * the repository, C1 for this computer), and says which held, which were wrong and which need
 * correcting. Notes that keep holding rise to the top; a note a run calls wrong stays out of prompts
 * until a person decides.
 */

/** Notes about this computer live under this key, beside each repository's. */
export const COMPUTER = "@computer";

/** How many notes of each kind go into a prompt. Pinned ones always do. */
const IN_PROMPT: Record<NoteScope, number> = { repo: 25, computer: 12 };

/** A repository or computer keeps this many notes; flagged and least trusted go first. */
export const MAX_NOTES = 100;

/** Two notes this alike say the same thing, so the new one confirms the old instead. */
const SAME = 0.6;

export interface PromptNote {
	ref: string;
	note: RepoNote;
}

export interface PromptNotes {
	repo: PromptNote[];
	computer: PromptNote[];
}

/** How much a note has earned its place: pinned first, then how often it held up, then how recent it is. */
function rank(note: RepoNote): number {
	return (note.pinned ? 1e6 : 0) + (note.confirmations ?? 0) * 10 + (note.confirmedAt ?? note.updatedAt ?? note.at) / 1e11;
}

const usable = (notes: RepoNote[]) => notes.filter((note) => !note.flagged).sort((a, b) => rank(b) - rank(a));

/** The notes a run gets, each with the label it can refer back to. */
export function notesForPrompt(repo: RepoNote[], computer: RepoNote[]): PromptNotes {
	const pick = (notes: RepoNote[], scope: NoteScope, prefix: string) => {
		const sorted = usable(notes);
		const pinned = sorted.filter((note) => note.pinned);
		const rest = sorted.filter((note) => !note.pinned).slice(0, Math.max(0, IN_PROMPT[scope] - pinned.length));
		return [...pinned, ...rest].map((note, index) => ({ ref: `${prefix}${index + 1}`, note }));
	};
	return { repo: pick(repo, "repo", "R"), computer: pick(computer, "computer", "C") };
}

/** Label to note id, kept on the run so its report can be matched back. */
export function noteRefs(notes: PromptNotes): Record<string, string> {
	return Object.fromEntries([...notes.repo, ...notes.computer].map(({ ref, note }) => [ref, note.id]));
}

/** The lines a prompt opens with. */
export function notesSection(notes: PromptNotes): string[] {
	if (!notes.repo.length && !notes.computer.length) return [];
	return [
		"Notes earlier runs left. They save you time, but they can be wrong or out of date: check one before you rely on it.",
		...(notes.repo.length ? ["About this repository:", ...notes.repo.map(({ ref, note }) => `- ${ref}: ${note.text}`)] : []),
		...(notes.computer.length ? ["About this computer (shells, tools, paths):", ...notes.computer.map(({ ref, note }) => `- ${ref}: ${note.text}`)] : []),
		"",
	];
}

/** The part of the report rules that asks for notes back. */
export function notesRules(hasNotes: boolean): string[] {
	return [
		"",
		"If you learnt how to work in this repository or on this computer in a way that would save the next agent time, add this after Proof:",
		"Remember:",
		"- repo: how to work here, such as a command that runs the tests, a setup step, a convention, a rule CI enforces, or a trap you fell into (checked: how you know)",
		"- computer: something about this computer, such as which shell or command works (checked: how you know)",
		"A note is about how to work, never about what the code does now or which line something is on: code changes, so those go stale. Only facts you checked, nothing about this issue alone, nothing already in the notes. Most runs have nothing to add.",
		...(hasNotes ? [
			"",
			"If you checked one of the notes above, say how it held up after Remember. Held means you saw that what the note says is true; if you saw the opposite, it's wrong, even if following it did no harm. Following a note isn't checking it. Leave out notes you didn't check, and don't reword a note that held:",
			"Notes check:",
			"- R1 held: what you saw that shows the note is true",
			"- R2 wrong: what is actually true, and how you know, for example \"the folder already existed when the run started\"",
			"- C1 now: the note as it should read, only when what it says has changed",
		] : []),
	];
}

/** Notes that hedge weren't checked, and notes that point at lines describe code that will change. */
const UNCHECKED = /\b(as far as i (can tell|know)|i (didn't|did not|haven't|have not) (check|confirm|verify|open|run)|probably|might be|i think|i believe|not sure|unconfirmed)\b/i;
const CODE_POSITION = /\.\w{1,5}:\d+|\bline \d+|\blines \d+/i;

/** Whether a fact is the kind worth keeping: checked, and about how to work rather than where code is. */
export function worthKeeping(text: string): boolean {
	return !UNCHECKED.test(text) && !CODE_POSITION.test(text);
}

/** A "correction" this close to the note only rewords it, so it counts as the note holding up. */
const REWORDED = 0.8;

/** Reads "repo: …" and "computer: …" lines, with an optional "(checked: …)" at the end. Unmarked lines are about the repository. */
export function parseRemember(lines: string[]): RunReport["remember"] {
	const found = lines.map((line) => {
		const scoped = line.match(/^(repo(?:sitory)?|computer|this computer|machine)\s*:\s*/i);
		const scope: NoteScope = scoped && /computer|machine/i.test(scoped[1]!) ? "computer" : "repo";
		let text = scoped ? line.slice(scoped[0].length) : line;
		const checked = text.match(/\s*\(checked:\s*([^)]*)\)\s*\.?$/i);
		if (checked) text = text.slice(0, checked.index);
		return { scope, text: text.trim(), checked: checked?.[1]?.trim() || undefined };
	}).filter((entry) => entry.text.length > 3 && entry.text.length <= 500);
	return found.length ? found : undefined;
}

/** Reads "R1 held", "R2 wrong: why" and "C1 now: new text". */
export function parseNoteChecks(lines: string[]): NoteCheck[] | undefined {
	const found = lines.flatMap((line): NoteCheck[] => {
		const match = line.match(/^\[?([RC]\d+)\]?\s*[:—–-]?\s*(held|holds|confirmed|still true|correct|wrong|outdated|out of date|false|now|update[sd]?|correct(?:ed|ion)?)\b\s*[:—–-]?\s*(.*)$/i);
		if (!match) return [];
		const word = match[2]!.toLowerCase();
		const rest = match[3]!.trim();
		// After "held", the rest is what showed it, not a new wording.
		if (/^(held|holds|confirmed|still true|correct)$/.test(word)) return [{ ref: match[1]!.toUpperCase(), verdict: "held", text: rest || undefined }];
		if (/^(wrong|outdated|out of date|false)$/.test(word)) return [{ ref: match[1]!.toUpperCase(), verdict: "wrong", text: rest || undefined }];
		if (rest.length > 3) return [{ ref: match[1]!.toUpperCase(), verdict: "now", text: rest }];
		return [];
	});
	return found.length ? found : undefined;
}

/** How alike two notes read, 0–1, by the words they share. */
export function noteSimilarity(a: string, b: string): number {
	const left = new Set(words(a));
	const right = new Set(words(b));
	if (!left.size || !right.size) return 0;
	let shared = 0;
	for (const word of left) if (right.has(word)) shared++;
	// Dice: shared words over the average length, so a short note inside a long one doesn't count as the same.
	return (2 * shared) / (left.size + right.size);
}

export interface NoteBook {
	repo: RepoNote[];
	computer: RepoNote[];
}

/**
 * What a run's report does to the notes: checks first (held, wrong, corrected), then new facts. A new
 * fact that says what a note already says confirms it instead. Returns the notes and a line per change.
 */
export function applyNoteReport(book: NoteBook, report: RunReport | undefined, run: Pick<Run, "id" | "stage" | "agentId" | "noteRefs">, now: number): NoteBook & { changes: string[] } {
	const notes: NoteBook = { repo: [...book.repo], computer: [...book.computer] };
	const changes: string[] = [];
	const by = { runId: run.id, stage: run.stage, agentId: run.agentId };
	const edit = (id: string, patch: (note: RepoNote) => RepoNote) => {
		for (const scope of ["repo", "computer"] as NoteScope[]) notes[scope] = notes[scope].map((note) => (note.id === id ? patch(note) : note));
	};
	for (const check of report?.noteChecks ?? []) {
		const id = run.noteRefs?.[check.ref];
		if (!id) continue;
		if (check.verdict === "held") {
			// The latest evidence shows beside the note, so a "held" that says the opposite is easy to spot.
			edit(id, (note) => ({ ...note, confirmations: (note.confirmations ?? 0) + 1, confirmedAt: now, ...(check.text ? { evidence: check.text } : {}) }));
			changes.push(`${check.ref} held`);
		} else if (check.verdict === "wrong") {
			edit(id, (note) => ({ ...note, flagged: { why: check.text ?? "Didn't hold", at: now, ...by } }));
			changes.push(`flagged ${check.ref} as wrong`);
		} else if (check.text) {
			const current = [...notes.repo, ...notes.computer].find((note) => note.id === id);
			if (current && noteSimilarity(current.text, check.text) >= REWORDED) {
				edit(id, (note) => ({ ...note, confirmations: (note.confirmations ?? 0) + 1, confirmedAt: now }));
				changes.push(`${check.ref} held`);
			} else if (worthKeeping(check.text)) {
				// A real change waits for you: the note leaves prompts, with the new wording ready to accept.
				edit(id, (note) => ({ ...note, flagged: { why: "It has changed.", proposed: check.text, at: now, ...by } }));
				changes.push(`suggested a correction to ${check.ref}`);
			}
		}
	}
	for (const [index, entry] of (report?.remember ?? []).entries()) {
		if (!worthKeeping(entry.text)) {
			changes.push("left out a note about code positions or one it hadn't checked");
			continue;
		}
		const same = notes[entry.scope].find((note) => noteSimilarity(note.text, entry.text) >= SAME);
		if (same) {
			edit(same.id, (note) => ({ ...note, confirmations: (note.confirmations ?? 0) + 1, confirmedAt: now }));
			changes.push("confirmed a note it would have added again");
			continue;
		}
		notes[entry.scope] = [{ id: `note-${now.toString(36)}-${run.id.slice(-4)}-${index}`, text: entry.text, checked: entry.checked, at: now, ...by }, ...notes[entry.scope]];
		changes.push(`noted ${entry.scope === "computer" ? "something about this computer" : "something about the repository"}`);
	}
	return { repo: trim(notes.repo), computer: trim(notes.computer), changes };
}

/** Keeps the most trusted notes when there are too many. */
function trim(notes: RepoNote[]): RepoNote[] {
	if (notes.length <= MAX_NOTES) return notes;
	const keep = new Set([...notes].sort((a, b) => (a.flagged ? -1e9 : 0) + rank(a) - ((b.flagged ? -1e9 : 0) + rank(b))).slice(notes.length - MAX_NOTES).map((note) => note.id));
	return notes.filter((note) => keep.has(note.id));
}
