import type { PhoneCapability, PhoneFileEntry, PhoneResults } from "../protocol";

/** Files show while the computer speaks protocol 5 and lets this phone read code. */
export const readsFiles = (state: { status: string; protocol?: number; capabilities?: readonly PhoneCapability[] }) => state.status === "connected" && (state.protocol ?? 0) >= 5 && Boolean(state.capabilities?.includes("code"));

/** A folder as read so far: its listing, or why it couldn't be read. Missing means it's still being read. */
export type Folder = PhoneResults["list_files"] | { error: string };
export type TreeRow =
  | { kind: "entry"; key: string; entry: PhoneFileEntry; depth: number; open: boolean }
  | { kind: "note"; key: string; depth: number; text: string; loading?: boolean };

/** The tree as rows: the top folder's entries, each open folder's below it, and a note where a folder is empty, still reading, or failed. */
export function treeRows(folders: ReadonlyMap<string, Folder>, open: ReadonlySet<string>, directory = "", depth = 0): TreeRow[] {
  const folder = folders.get(directory);
  if (!folder) return [{ kind: "note", key: `note:${directory}`, depth, text: "Reading…", loading: true }];
  if ("error" in folder) return [{ kind: "note", key: `note:${directory}`, depth, text: folder.error }];
  if (!folder.entries.length) return [{ kind: "note", key: `note:${directory}`, depth, text: directory ? "Empty folder" : "No files" }];
  const rows = folder.entries.flatMap((entry): TreeRow[] => {
    const isOpen = entry.directory && open.has(entry.path);
    const row: TreeRow = { kind: "entry", key: `entry:${entry.path}`, entry, depth, open: isOpen };
    return isOpen ? [row, ...treeRows(folders, open, entry.path, depth + 1)] : [row];
  });
  return folder.truncated ? [...rows, { kind: "note", key: `cut:${directory}`, depth, text: "More files are here than the phone shows. Search to find one." }] : rows;
}

/** A folder and every folder above it, top first: "src/lib" gives ["src", "src/lib"]. */
export const folderChain = (path: string) => path.split("/").map((_, index, parts) => parts.slice(0, index + 1).join("/"));

/** A path's name and the folder it's in ("" at the top). */
export function splitFilePath(path: string) {
  const slash = path.lastIndexOf("/");
  return { name: path.slice(slash + 1), folder: slash < 0 ? "" : path.slice(0, slash) };
}

/** How a thread's message names a file for the agent to open: `@path`, with a slash after a folder, as the window sends it. */
export const fileMention = (path: string, directory = false) => `@${path}${directory ? "/" : ""}`;
/** The draft with a mention added at its end, and a space after it to keep typing. */
export const withMention = (draft: string, mention: string) => `${draft.trim() ? `${draft.replace(/\s+$/, "")} ` : ""}${mention} `;

export const isMarkdown = (path: string) => /\.(md|markdown|mdx)$/i.test(path);

/** A text file's lines, without the empty one after a final newline. */
export function fileLines(text: string) {
  const lines = text.split(/\r?\n/);
  if (lines.length > 1 && lines.at(-1) === "") lines.pop();
  return lines;
}

/** Bytes as the window says them: 812 bytes, 14 KB, 1.4 MB. */
export function sizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
