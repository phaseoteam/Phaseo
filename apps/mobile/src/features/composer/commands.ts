/** A `/` command the composer offers. Choosing one removes the typed `/word` and runs it. */
export type ComposerCommand = { id: string; label: string; description: string };

export type SlashTrigger = { query: string; rangeStart: number; rangeEnd: number };

const isSpace = (char: string | undefined) => char === " " || char === "\n" || char === "\t" || char === "\r";

/**
 * The `/word` the caret is in, when it starts a line or follows a space. A second slash makes it a path ("/usr/bin"),
 * not a command, even after the caret.
 */
export function detectSlashTrigger(text: string, cursor: number): SlashTrigger | null {
  const end = Math.max(0, Math.min(text.length, Math.floor(Number.isFinite(cursor) ? cursor : text.length)));
  let start = end;
  while (start > 0 && !isSpace(text[start - 1])) start -= 1;
  if (text[start] !== "/") return null;
  let wordEnd = end;
  while (wordEnd < text.length && !isSpace(text[wordEnd])) wordEnd += 1;
  if (text.slice(start + 1, wordEnd).includes("/")) return null;
  return { query: text.slice(start + 1, end), rangeStart: start, rangeEnd: end };
}

/** The commands whose name contains the query, those starting with it first, in their own order otherwise. */
export function filterCommands(commands: readonly ComposerCommand[], query: string): ComposerCommand[] {
  const q = query.toLowerCase();
  const name = (command: ComposerCommand) => command.label.replace(/^\//, "").toLowerCase();
  const matching = commands.filter((command) => name(command).includes(q));
  return [...matching.filter((command) => name(command).startsWith(q)), ...matching.filter((command) => !name(command).startsWith(q))];
}

/** The draft with the typed `/word` (and one space after it) removed, and where the caret goes. */
export function removeTrigger(text: string, trigger: SlashTrigger) {
  const after = text.slice(trigger.rangeEnd);
  const value = `${text.slice(0, trigger.rangeStart)}${after.startsWith(" ") ? after.slice(1) : after}`;
  return { value, cursor: trigger.rangeStart };
}
