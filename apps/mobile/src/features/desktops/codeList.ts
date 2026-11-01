import type { PhoneChat } from "./protocol";

/**
 * How a thread's status reads in the Code list, the way the desktop's sidebar shows it: what needs you first, then
 * work in progress, then problems, then an unread result. Null for a quiet thread, which shows its time instead.
 */
export type CodeStatus = { kind: "needs-you" | "working" | "waiting" | "failed" | "stopped" | "limited" | "done"; label: string };
export function codeStatus(chat: Pick<PhoneChat, "needsYou" | "status" | "unread">): CodeStatus | null {
  if (chat.needsYou) return { kind: "needs-you", label: "Needs you" };
  switch (chat.status) {
    case "running": return { kind: "working", label: "Working" };
    case "waiting": return { kind: "waiting", label: "Waiting" };
    case "failed": return { kind: "failed", label: "Failed" };
    case "interrupted": return { kind: "stopped", label: "Stopped" };
    case "limited": return { kind: "limited", label: "Limited" };
    default: return chat.unread ? { kind: "done", label: "Done" } : null;
  }
}

export type CodeListItem =
  | { type: "heading"; key: string; title: string; count: number; toggle?: "settled"; open: boolean }
  | { type: "folder"; key: string; projectId: string | null; title: string }
  | { type: "thread"; key: string; chat: PhoneChat };

const newest = (a: PhoneChat, b: PhoneChat) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
const matches = (chat: PhoneChat, search: string) => `${chat.title} ${chat.project ?? ""} ${chat.branch ?? ""}`.toLocaleLowerCase().includes(search);

/**
 * The Code list, as the desktop's sidebar orders it: threads that need you first, then the rest in project folders
 * (the folder with the latest thread first, threads newest first, those without a project last), then the settled
 * ones under a heading that stays collapsed until opened.
 */
export function codeListItems(chats: readonly PhoneChat[], { query = "", settledOpen = false }: { query?: string; settledOpen?: boolean } = {}): CodeListItem[] {
  const search = query.trim().toLocaleLowerCase();
  const shown = search ? chats.filter((chat) => matches(chat, search)) : [...chats];
  const needsYou = shown.filter((chat) => chat.needsYou).sort(newest);
  const settled = shown.filter((chat) => !chat.needsYou && chat.settled).sort(newest);
  const folders = new Map<string, { projectId: string | null; title: string; chats: PhoneChat[] }>();
  for (const chat of shown.filter((entry) => !entry.needsYou && !entry.settled).sort(newest)) {
    const key = chat.projectId ?? "";
    const folder = folders.get(key) ?? { projectId: chat.projectId ?? null, title: chat.project ?? "No project", chats: [] };
    folder.chats.push(chat);
    folders.set(key, folder);
  }
  const items: CodeListItem[] = [];
  const thread = (chat: PhoneChat): CodeListItem => ({ type: "thread", key: chat.id, chat });
  if (needsYou.length) items.push({ type: "heading", key: "heading:needs-you", title: "Needs you", count: needsYou.length, open: true }, ...needsYou.map(thread));
  // Map order is the newest thread's order, so the folder with the latest work leads; no project goes last.
  const ordered = [...folders.values()].sort((a, b) => Number(a.projectId === null) - Number(b.projectId === null));
  for (const folder of ordered) items.push({ type: "folder", key: `folder:${folder.projectId ?? ""}`, projectId: folder.projectId, title: folder.title }, ...folder.chats.map(thread));
  // Searching opens the settled threads, so a match is never hidden.
  const open = settledOpen || Boolean(search);
  if (settled.length) items.push({ type: "heading", key: "heading:settled", title: "Settled", count: settled.length, toggle: "settled", open }, ...(open ? settled.map(thread) : []));
  return items;
}
