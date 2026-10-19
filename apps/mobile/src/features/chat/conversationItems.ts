import { toTurns, type Turn } from "./groups";
import type { LiveAnswer } from "./live";
import { markdownChunks } from "./markdownChunks";
import type { ChatMessage, ChatSummary } from "./types";

/**
 * The conversation list's rows. A turn is its question, then the shown answer in chunks of whole Markdown
 * blocks (one chunk for almost every answer, many for a very long one), so the list virtualises long answers
 * too. Side-by-side columns (wide tablets) keep a turn in one row. Summary markers sit where the summarised
 * messages end.
 */
export type ConversationItem =
  | { type: "summary"; key: string; summaries: ChatSummary[] }
  | { type: "user"; key: string; turn: Turn; last: boolean }
  | { type: "answer"; key: string; turn: Turn; message: ChatMessage; chunk: number; text: string | null; first: boolean; last: boolean; header: boolean }
  | { type: "columns"; key: string; turn: Turn };

const chunkCache = new Map<string, { content: string; chunks: string[] }>();

/** A finished answer's chunks, worked out once per answer text. */
export function chunksOf(message: ChatMessage) {
  const cached = chunkCache.get(message.id);
  if (cached && cached.content === message.content) return cached.chunks;
  const chunks = markdownChunks(message.content);
  chunkCache.set(message.id, { content: message.content, chunks });
  if (chunkCache.size > 600) chunkCache.delete(chunkCache.keys().next().value!);
  return chunks;
}

/** The answer a turn shows on phones: the one picked in its tabs, or the first. */
export function shownAnswer(turn: Turn, selected: Record<string, string>) {
  return turn.answers.find((answer) => answer.model === selected[turn.key]) ?? turn.answers[0];
}

export function buildItems(args: { messages: readonly ChatMessage[]; summaries: readonly ChatSummary[]; models: string[]; side: boolean; selected: Record<string, string>; live(id: string): LiveAnswer | null }): ConversationItem[] {
  const items: ConversationItem[] = [];
  const turns = toTurns(args.messages as ChatMessage[], args.models);
  let summary = 0;
  for (const turn of turns) {
    const markers: ChatSummary[] = [];
    while (summary < args.summaries.length && args.summaries[summary]!.throughPosition < turn.user.position) markers.push(args.summaries[summary++]!);
    if (markers.length) items.push({ type: "summary", key: `summary:${markers[0]!.throughPosition}:${markers.map((marker) => marker.model).join(",")}`, summaries: markers });
    const answer = args.side && turn.answers.length > 1 ? null : shownAnswer(turn, args.selected);
    items.push({ type: "user", key: `user:${turn.user.id}`, turn, last: !answer && !(args.side && turn.answers.length > 1) });
    if (args.side && turn.answers.length > 1) {
      items.push({ type: "columns", key: `columns:${turn.user.id}`, turn });
      continue;
    }
    if (!answer) continue;
    const header = turn.answers.length === 1;
    let texts: (string | null)[];
    if (answer.status === "streaming") {
      // Finished chunks of a streaming answer are fixed; the last row reads the live text itself.
      const live = args.live(answer.id);
      const edges = [0, ...(live?.boundaries ?? [])];
      texts = [...edges.slice(1).map((end, index) => live!.content.slice(edges[index], end).replace(/\s+$/, "")), null];
    } else {
      texts = chunksOf(answer);
    }
    texts.forEach((text, chunk) => items.push({ type: "answer", key: `answer:${answer.id}:${chunk}`, turn, message: answer, chunk, text, first: chunk === 0, last: chunk === texts.length - 1, header }));
  }
  return items;
}

const sameAnswers = (a: Turn, b: Turn) => a.answers.length === b.answers.length && a.answers.every((answer, index) => answer === b.answers[index]);

function same(a: ConversationItem, b: ConversationItem) {
  if (a.type !== b.type || a.key !== b.key) return false;
  switch (a.type) {
    case "summary": return b.type === "summary" && a.summaries.length === b.summaries.length && a.summaries.every((summary, index) => summary === b.summaries[index]);
    case "user": return b.type === "user" && a.turn.user === b.turn.user && a.last === b.last && sameAnswers(a.turn, b.turn);
    case "columns": return b.type === "columns" && a.turn.user === b.turn.user && sameAnswers(a.turn, b.turn);
    case "answer": return b.type === "answer" && a.message === b.message && a.text === b.text && a.first === b.first && a.last === b.last && a.header === b.header;
  }
}

/** Keeps the previous object for every row that didn't change, so memoised rows skip rendering. */
export function reconcileItems(previous: readonly ConversationItem[], next: ConversationItem[]) {
  if (!previous.length) return next;
  const byKey = new Map(previous.map((item) => [item.key, item]));
  let changed = previous.length !== next.length;
  const items = next.map((item, index) => {
    const before = byKey.get(item.key);
    const kept = before && same(before, item) ? before : item;
    if (kept !== previous[index]) changed = true;
    return kept;
  });
  return changed ? items : (previous as ConversationItem[]);
}
