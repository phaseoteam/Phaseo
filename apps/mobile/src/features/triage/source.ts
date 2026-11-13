/**
 * Reads the Phaseo source at one commit from GitHub, for triage on the phone. The repository is public, so no sign-in
 * is needed: folder listings use the GitHub API (one call each, 60 an hour per network without sign-in), and files come
 * from raw.githubusercontent.com, which that limit doesn't cover. Everything read is kept for the run.
 */
export const SOURCE_REPOSITORY = "phaseoteam/Phaseo";

/** Where search looks unless the agent names a folder: the phone app's code. */
export const DEFAULT_SEARCH_PATHS = ["apps/mobile/src", "apps/mobile/app"];

const TEXT_FILE = /\.(tsx?|jsx?|mjs|cjs|json|md|ya?ml|css|kt|java|swift|gradle|properties|xml|txt|sql)$/i;
const SEARCH_FILE_LIMIT = 600;
const SEARCH_FILE_BYTES = 400_000;
const MATCH_LIMIT = 80;
const READ_LINE_LIMIT = 400;

type Fetch = (url: string, init?: { headers?: Record<string, string>; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; text(): Promise<string>; json(): Promise<unknown> }>;
type TreeEntry = { path: string; type: "blob" | "tree"; size?: number };

export class SourceError extends Error {}

const cleanPath = (path: string) => path.trim().replace(/^\.?\/+/, "").replace(/\/+$/, "");

export class SourceReader {
  private trees = new Map<string, Promise<TreeEntry[]>>();
  private files = new Map<string, Promise<string>>();

  constructor(readonly ref: string, private readonly fetcher: Fetch = fetch as unknown as Fetch, private readonly signal?: AbortSignal) {}

  private async api(path: string) {
    const response = await this.fetcher(`https://api.github.com/repos/${SOURCE_REPOSITORY}/${path}`, { headers: { accept: "application/vnd.github+json" }, signal: this.signal });
    if (response.status === 403 || response.status === 429) throw new SourceError("GitHub's limit for reading without signing in is used up for now (60 folder listings an hour on this network). Read files you already know the path of, or try again later.");
    if (response.status === 404) throw new SourceError("Not found at this commit.");
    if (!response.ok) throw new SourceError(`GitHub answered ${response.status}.`);
    return response.json();
  }

  /** Every file and folder under `path`, recursively. */
  tree(path: string) {
    const key = cleanPath(path);
    let tree = this.trees.get(key);
    if (!tree) {
      tree = this.api(`git/trees/${encodeURIComponent(key ? `${this.ref}:${key}` : this.ref)}?recursive=1`).then((body) => {
        const entries = (body as { tree?: TreeEntry[] }).tree ?? [];
        return entries.filter((entry) => entry.type === "blob" || entry.type === "tree").map((entry) => ({ ...entry, path: key ? `${key}/${entry.path}` : entry.path }));
      });
      tree.catch(() => this.trees.delete(key));
      this.trees.set(key, tree);
    }
    return tree;
  }

  /** Whether this ref is on GitHub (a build from commits that were never pushed isn't). Reads one raw file, which GitHub's listing limit doesn't cover. */
  async exists() {
    const response = await this.fetcher(`https://raw.githubusercontent.com/${SOURCE_REPOSITORY}/${this.ref}/package.json`, { signal: this.signal });
    if (response.status === 404) return false;
    if (!response.ok) throw new SourceError(`GitHub answered ${response.status}.`);
    return true;
  }

  /** One file's text. */
  file(path: string) {
    const key = cleanPath(path);
    let file = this.files.get(key);
    if (!file) {
      file = this.fetcher(`https://raw.githubusercontent.com/${SOURCE_REPOSITORY}/${this.ref}/${key.split("/").map(encodeURIComponent).join("/")}`, { signal: this.signal }).then(async (response) => {
        if (response.status === 404) throw new SourceError(`${key} isn't in the source at this commit.`);
        if (!response.ok) throw new SourceError(`GitHub answered ${response.status} for ${key}.`);
        return response.text();
      });
      file.catch(() => this.files.delete(key));
      this.files.set(key, file);
    }
    return file;
  }

  /** A folder's direct contents, folders first, as "name/" and "name (size)". */
  async list(path: string) {
    const key = cleanPath(path);
    const depth = key ? key.split("/").length + 1 : 1;
    const entries = key ? await this.tree(key) : await this.api(`git/trees/${encodeURIComponent(this.ref)}`).then((body) => ((body as { tree?: TreeEntry[] }).tree ?? []));
    const direct = entries.filter((entry) => entry.path.split("/").length === depth);
    const name = (entry: TreeEntry) => entry.path.split("/").at(-1);
    const folders = direct.filter((entry) => entry.type === "tree").map((entry) => `${name(entry)}/`).sort();
    const files = direct.filter((entry) => entry.type === "blob").map((entry) => `${name(entry)}${entry.size != null ? ` (${entry.size} bytes)` : ""}`).sort();
    return [...folders, ...files].join("\n") || "(empty)";
  }

  /** Lines `start` to `end` (1-based, inclusive) with their numbers, at most 400 at a time. */
  async read(path: string, start = 1, end?: number) {
    const lines = (await this.file(path)).split("\n");
    const from = Math.max(1, Math.floor(start));
    const to = Math.min(lines.length, Math.floor(end ?? from + READ_LINE_LIMIT - 1), from + READ_LINE_LIMIT - 1);
    const body = lines.slice(from - 1, to).map((line, index) => `${from + index}\t${line}`).join("\n");
    return `${cleanPath(path)}, lines ${from}–${to} of ${lines.length}${to < lines.length ? ` (read on from line ${to + 1})` : ""}\n${body}`;
  }

  /** Lines matching `pattern` (a regular expression, case-insensitive) in the text files under the folders. */
  async search(pattern: string, paths: string[] = DEFAULT_SEARCH_PATHS) {
    let regex: RegExp;
    try { regex = new RegExp(pattern, "i"); } catch { regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); }
    const trees = await Promise.all(paths.map((path) => this.tree(path)));
    const candidates = trees.flat().filter((entry) => entry.type === "blob" && TEXT_FILE.test(entry.path) && (entry.size ?? 0) <= SEARCH_FILE_BYTES);
    if (candidates.length > SEARCH_FILE_LIMIT) return `That covers ${candidates.length} files, more than the ${SEARCH_FILE_LIMIT} a search can read. Search a narrower folder.`;
    const matches: string[] = [];
    let total = 0;
    await pool(candidates, 8, async (entry) => {
      const text = await this.file(entry.path).catch(() => "");
      text.split("\n").forEach((line, index) => {
        if (!regex.test(line)) return;
        total += 1;
        if (matches.length < MATCH_LIMIT) matches.push(`${entry.path}:${index + 1}: ${line.trim().slice(0, 200)}`);
      });
    });
    if (!total) return `No lines match /${pattern}/i in ${paths.join(", ")}.`;
    return `${total} matching ${total === 1 ? "line" : "lines"}${total > matches.length ? `, the first ${matches.length} shown` : ""}:\n${matches.sort().join("\n")}`;
  }

  /** The latest commits up to this one, touching `path` when given. */
  async history(path?: string) {
    const query = new URLSearchParams({ sha: this.ref, per_page: "15", ...path ? { path: cleanPath(path) } : {} });
    const commits = await this.api(`commits?${query.toString()}`) as { sha: string; commit: { message: string; author?: { date?: string } } }[];
    if (!commits.length) return "No commits found.";
    return commits.map((entry) => `${entry.sha.slice(0, 10)} ${entry.commit.author?.date?.slice(0, 10) ?? ""} ${entry.commit.message.split("\n")[0]}`).join("\n");
  }
}

async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) await work(items[next++]!);
  }));
}
