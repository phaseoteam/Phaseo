/**
 * Reads the docs changelog (its Markdown copy) into entries for "What's new". The current month's page uses plain
 * "## October 9, 2026" sections; archived months wrap each day in <Update label="…">. Both become the same entries;
 * pictures and markup are left out.
 */

export type ChangelogSegment = { text: string; url?: string };
export type ChangelogGroup = { title: string | null; items: ChangelogSegment[][] };
export type ChangelogEntry = { date: string; time: number | null; groups: ChangelogGroup[] };

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "October 9, 2026" → that day at 00:00 UTC; null when the label isn't a date. */
export function changelogDate(label: string): number | null {
  const match = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(label.trim());
  if (!match) return null;
  const month = MONTHS.indexOf(match[1]!.toLowerCase());
  return month === -1 ? null : Date.UTC(Number(match[3]), month, Number(match[2]));
}

/** "New Models" → "New models"; acronyms (API, AI) stay as they are. */
export function sentenceCase(title: string) {
  return title.trim().split(/\s+/).map((word, index) => (index === 0 || /^[A-Z0-9]{2,}$/.test(word) ? word : word.toLowerCase())).join(" ");
}

/** Inline Markdown to plain text with links: [label](url), **bold**, `code` and HTML tags. */
export function inlineSegments(text: string): ChangelogSegment[] {
  const segments: ChangelogSegment[] = [];
  const clean = (value: string) => value.replace(/<[^>]+>/g, "").replace(/\*\*|__|`/g, "").replace(/\\([\\`*_[\]()#+.!-])/g, "$1");
  const link = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (const match of text.matchAll(link)) {
    if (match.index! > last) segments.push({ text: clean(text.slice(last, match.index)) });
    segments.push({ text: clean(match[1]!), url: match[2]! });
    last = match.index! + match[0].length;
  }
  if (last < text.length) segments.push({ text: clean(text.slice(last)) });
  return segments.filter((segment) => segment.text);
}

const ENTRY_HEADING = /^##\s+(.+?)\s*$/;
const UPDATE_OPEN = /^<Update\b[^>]*\blabel=["']([^"']+)["'][^>]*>/;
const GROUP_PARAGRAPH = /^<p\b[^>]*>(.*?)<\/p>$/;
const GROUP_HEADING = /^###\s+(.+?)\s*$/;
const ITEM = /^[*-]\s+(.+)$/;

export function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let entry: ChangelogEntry | null = null;
  let group: ChangelogGroup | null = null;
  const startEntry = (label: string) => {
    const time = changelogDate(label);
    if (time == null) {
      entry = null;
      return;
    }
    entry = { date: label.trim(), time, groups: [] };
    group = null;
    entries.push(entry);
  };
  const addItem = (text: string) => {
    if (!entry) return;
    if (!group) {
      group = { title: null, items: [] };
      entry.groups.push(group);
    }
    const segments = inlineSegments(text);
    if (segments.length) group.items.push(segments);
  };
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(">") || line.startsWith("<img") || line.startsWith("![")) continue;
    // A rule ends a day in the current month's page; anything after it (the docs footer) belongs to no entry.
    if (/^(\*{3,}|-{3,})$/.test(line)) {
      entry = null;
      continue;
    }
    const heading = ENTRY_HEADING.exec(line);
    const update = UPDATE_OPEN.exec(line);
    if (heading || update) {
      startEntry((heading ?? update)![1]!);
      continue;
    }
    if (line.startsWith("</Update")) {
      entry = null;
      continue;
    }
    if (!entry) continue;
    const current: ChangelogEntry = entry;
    const title = GROUP_PARAGRAPH.exec(line)?.[1] ?? GROUP_HEADING.exec(line)?.[1];
    if (title != null) {
      group = { title: sentenceCase(title.replace(/<[^>]+>/g, "")), items: [] };
      current.groups.push(group);
      continue;
    }
    if (line.startsWith("<") || line.startsWith("#")) continue;
    addItem(ITEM.exec(line)?.[1] ?? line);
  }
  return entries.filter((candidate) => candidate.groups.some((entryGroup) => entryGroup.items.length));
}

/** The archive page holding the month before an entry's (`2026-09` for October 2026). */
export function previousMonth(time: number) {
  const date = new Date(time);
  const month = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  return `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Entries from several pages, newest first, each date once. */
export function mergeChangelogs(pages: ChangelogEntry[][], limit = 20): ChangelogEntry[] {
  const seen = new Set<string>();
  return pages.flat()
    .filter((entry) => (seen.has(entry.date) ? false : (seen.add(entry.date), true)))
    .sort((a, b) => (b.time ?? 0) - (a.time ?? 0))
    .slice(0, limit);
}

/** A link to a model page on phaseo.app opens the app's own model page. */
export function modelIdFromUrl(url: string, origin: string): string | null {
  try {
    const parsed = new URL(url);
    const home = new URL(origin);
    if (parsed.hostname !== home.hostname) return null;
    const match = /^\/models\/(.+?)\/?$/.exec(parsed.pathname);
    return match ? decodeURIComponent(match[1]!) : null;
  } catch {
    return null;
  }
}
