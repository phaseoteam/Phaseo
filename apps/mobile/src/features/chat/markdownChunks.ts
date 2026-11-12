/**
 * Long answers render as several list items (chunks of whole Markdown blocks) so a 400 KB answer opens and
 * scrolls like any other, and a streaming answer re-renders only its last block. Blocks end at blank lines
 * outside code fences, unless the next line is indented (it continues the block, as in a list item).
 */

/** About this many characters per chunk. */
export const CHUNK_TARGET = 6_000;
/** Above these, one table or code block is cut into pieces (the table header is repeated on each). */
export const TABLE_PIECE_ROWS = 100;
export const CODE_PIECE_LINES = 200;
const TEXT_PIECE_CHARS = 16_000;

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Offsets where new blocks start (each after a blank line), in `text` from `from`. With `streaming`, a block
 * only counts as started once its first character has arrived, so a later chunk of the same answer never
 * moves an earlier boundary.
 */
export function blockStarts(text: string, from = 0): number[] {
  const starts: number[] = [];
  let fence: string | null = null;
  let offset = from;
  let blank = false;
  let sawContent = false;
  while (offset < text.length) {
    const newline = text.indexOf("\n", offset);
    const end = newline === -1 ? text.length : newline;
    const line = text.slice(offset, end);
    const complete = newline !== -1;
    if (fence) {
      if (complete && line.trim().startsWith(fence)) fence = null;
      blank = false;
    } else if (!line.trim()) {
      if (complete && sawContent) blank = true;
    } else {
      const indented = /^[ \t]/.test(line);
      // A non-blank line after a blank run starts a new block, unless it's indented (a continuation).
      if (blank && !indented) starts.push(offset);
      blank = false;
      sawContent = true;
      const match = FENCE.exec(line);
      if (match && complete) fence = match[1]!.slice(0, 3);
      else if (match) break;
    }
    if (!complete) break;
    offset = newline + 1;
  }
  return starts;
}

/** New chunk boundaries in a streaming answer after the boundary `from`: each is the start of a block once the chunk before it reached the target size. */
export function streamingBoundaries(text: string, from = 0, target = CHUNK_TARGET): number[] {
  const boundaries: number[] = [];
  let chunkStart = from;
  for (const start of blockStarts(text, from)) {
    if (start - chunkStart >= target) {
      boundaries.push(start);
      chunkStart = start;
    }
  }
  return boundaries;
}

/** A finished block, as one or more display pieces: giant tables, code blocks and paragraphs are cut up. */
function pieces(block: string): string[] {
  const lines = block.split("\n");
  const fence = FENCE.exec(lines[0] ?? "");
  if (fence && lines.length > CODE_PIECE_LINES + 50) {
    const open = lines[0]!;
    const close = fence[1]!;
    const closed = lines.length > 1 && lines.at(-1)!.trim().startsWith(close.slice(0, 3));
    const body = lines.slice(1, closed ? -1 : undefined);
    const out: string[] = [];
    for (let index = 0; index < body.length; index += CODE_PIECE_LINES) out.push([open, ...body.slice(index, index + CODE_PIECE_LINES), close].join("\n"));
    return out;
  }
  const table = lines.length > 2 && /^\s*\|/.test(lines[0]!) && /^\s*\|?\s*:?-{3,}/.test(lines[1]!);
  if (table && lines.length - 2 > TABLE_PIECE_ROWS + 20) {
    const header = lines.slice(0, 2);
    const rows = lines.slice(2);
    const out: string[] = [];
    for (let index = 0; index < rows.length; index += TABLE_PIECE_ROWS) out.push([...header, ...rows.slice(index, index + TABLE_PIECE_ROWS)].join("\n"));
    return out;
  }
  if (!fence && !table && block.length > TEXT_PIECE_CHARS * 1.5) {
    const out: string[] = [];
    let current = "";
    for (const line of lines) {
      if (current.length + line.length > TEXT_PIECE_CHARS && current) { out.push(current); current = ""; }
      current = current ? `${current}\n${line}` : line;
    }
    if (current) out.push(current);
    return out;
  }
  return [block];
}

/**
 * A finished answer as display chunks, cut where streamingBoundaries cut it while it streamed (so nothing
 * moves when it finishes). Only a chunk that is one giant block (a 900-row table, a very long code block)
 * is cut further, into pieces of about `target` characters.
 */
export function markdownChunks(text: string, target = CHUNK_TARGET): string[] {
  if (text.length < target) return [text];
  const edges = [0, ...streamingBoundaries(text, 0, target), text.length];
  const chunks: string[] = [];
  for (let index = 0; index < edges.length - 1; index += 1) {
    const chunk = text.slice(edges[index], edges[index + 1]).replace(/\s+$/, "");
    if (chunk.length <= target * 3) {
      if (chunk) chunks.push(chunk);
      continue;
    }
    const starts = [0, ...blockStarts(chunk), chunk.length];
    let current = "";
    for (let block = 0; block < starts.length - 1; block += 1) {
      for (const piece of pieces(chunk.slice(starts[block], starts[block + 1]).replace(/\s+$/, ""))) {
        if (current && current.length + piece.length > target) {
          chunks.push(current);
          current = "";
        }
        current = current ? `${current}\n\n${piece}` : piece;
      }
    }
    if (current) chunks.push(current);
  }
  return chunks.length ? chunks : [text];
}

/** A streaming tail as its finished blocks (which never change again) and the block still arriving. */
export function liveBlocks(text: string): { done: string[]; live: string } {
  const starts = blockStarts(text);
  if (!starts.length) return { done: [], live: text };
  const done: string[] = [];
  let previous = 0;
  for (const start of starts) {
    done.push(text.slice(previous, start).replace(/\s+$/, ""));
    previous = start;
  }
  return { done, live: text.slice(previous) };
}
