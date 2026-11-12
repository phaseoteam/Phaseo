import type { PhoneCapability, PhoneDiffFile, PhoneDiffScope, PhoneGitFile } from "../protocol";

/** Git status and diffs arrived in protocol 4, behind the `code` capability. */
export const readsCode = (state: { status: string; protocol?: number; capabilities?: readonly PhoneCapability[] }) => state.status === "connected" && (state.protocol ?? 0) >= 4 && Boolean(state.capabilities?.includes("code"));

/**
 * One row of a file's diff as the review shows it: a hunk's heading, or a line with its numbers on each side (an added
 * line has only the new number, a removed one only the old).
 */
export type DiffRow =
  | { kind: "hunk"; key: string; text: string }
  | { kind: "add" | "remove" | "context"; key: string; text: string; oldLine: number | null; newLine: number | null }
  | { kind: "note"; key: string; text: string };

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/;

/** A file's patch (from `diff --git` on) as rows: headers are dropped, hunks and their lines numbered. */
export function diffRows(patch: string): DiffRow[] {
  const rows: DiffRow[] = [];
  let oldLine = 0, newLine = 0, inHunk = false;
  const lines = patch.split("\n");
  if (lines.at(-1) === "") lines.pop();
  lines.forEach((line, index) => {
    const key = String(index);
    const hunk = HUNK.exec(line);
    if (hunk) {
      inHunk = true;
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      rows.push({ kind: "hunk", key, text: line });
      return;
    }
    if (!inHunk) return;
    if (line.startsWith("+")) rows.push({ kind: "add", key, text: line.slice(1), oldLine: null, newLine: newLine++ });
    else if (line.startsWith("-")) rows.push({ kind: "remove", key, text: line.slice(1), oldLine: oldLine++, newLine: null });
    else if (line.startsWith("\\")) rows.push({ kind: "note", key, text: "No newline at end of file" });
    else if (line.startsWith("diff --git ")) inHunk = false;
    else rows.push({ kind: "context", key, text: line.slice(1), oldLine: oldLine++, newLine: newLine++ });
  });
  return rows;
}

type LineRow = Extract<DiffRow, { oldLine: number | null }>;
export const isLine = (row: DiffRow): row is LineRow => row.kind === "add" || row.kind === "remove" || row.kind === "context";

/**
 * The lines a comment is about, as `path:L12-L18` names them: new-side numbers, or old-side ones when only removed
 * lines were picked (they no longer exist in the new file).
 */
export function rangeLabel(path: string, rows: readonly DiffRow[]) {
  const lines = rows.filter(isLine);
  const side = lines.some((row) => row.newLine !== null) ? "new" : "old";
  const numbers = lines.map((row) => (side === "new" ? row.newLine : row.oldLine)).filter((value): value is number => value !== null);
  if (!numbers.length) return path;
  const first = Math.min(...numbers), last = Math.max(...numbers);
  const range = first === last ? `L${first}` : `L${first}-L${last}`;
  return side === "new" ? `${path}:${range}` : `${path}:${range} (removed)`;
}

/**
 * A review comment as it goes into the thread's message: where it is, the lines it's about (as a diff), and the comment.
 * It's only text in the draft, so the person can still edit it before sending.
 */
export function reviewComment(path: string, rows: readonly DiffRow[], comment: string) {
  const quoted = rows.filter(isLine).map((row) => `${row.kind === "add" ? "+" : row.kind === "remove" ? "-" : " "}${row.text}`);
  return [`${rangeLabel(path, rows)}`, "```diff", ...quoted, "```", comment.trim()].join("\n");
}

/** Adds a block to a draft, a blank line after what's there. */
export const appendBlock = (draft: string, block: string) => (draft.trim() ? `${draft.replace(/\s+$/, "")}\n\n${block}` : block);

/** The rows between two picked rows, in order, inclusive. */
export function pickedRows(rows: readonly DiffRow[], from: string, to: string) {
  const a = rows.findIndex((row) => row.key === from), b = rows.findIndex((row) => row.key === to);
  if (a < 0 || b < 0) return [];
  return rows.slice(Math.min(a, b), Math.max(a, b) + 1).filter(isLine);
}

export const SCOPES: { value: PhoneDiffScope; label: string }[] = [
  { value: "uncommitted", label: "Uncommitted" },
  { value: "branch", label: "Branch" },
  { value: "turn", label: "This turn" },
];

/** "+12 −3", or "Binary" for a file git can't show as lines. */
export function fileCounts(file: Pick<PhoneDiffFile, "additions" | "deletions" | "binary">) {
  return file.binary || file.additions < 0 ? "Binary" : `+${file.additions} −${file.deletions}`;
}

/** Totals for a diff's heading: "4 files · +40 −12". */
export function diffSummary(files: readonly PhoneDiffFile[]) {
  const text = files.filter((file) => !file.binary && file.additions >= 0);
  const additions = text.reduce((total, file) => total + file.additions, 0), deletions = text.reduce((total, file) => total + file.deletions, 0);
  return `${files.length === 1 ? "1 file" : `${files.length} files`} · +${additions} −${deletions}`;
}

const STATUS_WORDS: Record<PhoneDiffFile["status"], string> = { added: "Added", modified: "Modified", deleted: "Deleted", renamed: "Renamed" };
export const fileStatusWord = (file: Pick<PhoneDiffFile, "status">) => STATUS_WORDS[file.status];

/** A sidebar folder's "N changed", from git_status; nothing when the work is clean. */
export function changedLabel(files: readonly PhoneGitFile[]) {
  return files.length ? `${files.length} changed` : null;
}

/** A path split for a row: the file's name, then its folder in quieter text. */
export function splitPath(path: string) {
  const at = path.lastIndexOf("/");
  return at < 0 ? { name: path, folder: "" } : { name: path.slice(at + 1), folder: path.slice(0, at) };
}
