import type { PhoneChat, PhoneProject } from "./protocol";

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
  | { type: "thread"; key: string; chat: PhoneChat; /** Listed under its project's folder, so the row needn't name the project. */ inFolder: boolean };

const newest = (a: PhoneChat, b: PhoneChat) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
const matches = (chat: PhoneChat, search: string) => `${chat.title} ${chat.project ?? ""} ${chat.branch ?? ""}`.toLocaleLowerCase().includes(search);

type Folder = { projectId: string | null; title: string; pinned: boolean; chats: PhoneChat[] };

/**
 * The computer's threads as its sidebar orders them: threads that need you first, then the rest in project folders,
 * then the settled ones under a heading that stays collapsed until opened. With the computer's `projects` (protocol
 * 2), every project has a folder, empty ones too: pinned first in the computer's order, then by latest thread, then
 * the empty ones; archived projects and worktrees (whose threads the computer files under their source) have none.
 * Without them, folders come from the threads alone. Threads without a project are always last.
 */
export function codeListItems(chats: readonly PhoneChat[], { query = "", settledOpen = false, projects = null }: { query?: string; settledOpen?: boolean; projects?: readonly PhoneProject[] | null } = {}): CodeListItem[] {
  const search = query.trim().toLocaleLowerCase();
  const shown = search ? chats.filter((chat) => matches(chat, search)) : [...chats];
  const needsYou = shown.filter((chat) => chat.needsYou).sort(newest);
  const settled = shown.filter((chat) => !chat.needsYou && chat.settled).sort(newest);
  const folders = new Map<string, Folder>();
  for (const project of projects ?? []) {
    if (!project.worktreeOf && !project.archived) folders.set(project.id, { projectId: project.id, title: project.name, pinned: Boolean(project.pinned), chats: [] });
  }
  for (const chat of shown.filter((entry) => !entry.needsYou && !entry.settled).sort(newest)) {
    const key = chat.projectId ?? "";
    const folder = folders.get(key) ?? { projectId: chat.projectId ?? null, title: chat.project ?? "No project", pinned: false, chats: [] };
    folder.chats.push(chat);
    folders.set(key, folder);
  }
  const items: CodeListItem[] = [];
  const thread = (chat: PhoneChat): CodeListItem => ({ type: "thread", key: chat.id, chat, inFolder: false });
  if (needsYou.length) items.push({ type: "heading", key: "heading:needs-you", title: "Needs you", count: needsYou.length, open: true }, ...needsYou.map(thread));
  const latest = (folder: Folder) => folder.chats[0]?.updatedAt ?? "";
  // A search shows only the folders it found threads in.
  const listed = [...folders.values()].filter((folder) => folder.chats.length || (!search && folder.projectId !== null));
  const ordered = [
    ...listed.filter((folder) => folder.pinned),
    ...listed.filter((folder) => !folder.pinned && folder.projectId !== null && folder.chats.length).sort((a, b) => latest(b).localeCompare(latest(a))),
    ...listed.filter((folder) => !folder.pinned && folder.projectId !== null && !folder.chats.length),
    ...listed.filter((folder) => folder.projectId === null),
  ];
  for (const folder of ordered) items.push({ type: "folder", key: `folder:${folder.projectId ?? ""}`, projectId: folder.projectId, title: folder.title }, ...folder.chats.map((chat): CodeListItem => ({ type: "thread", key: chat.id, chat, inFolder: true })));
  // Searching opens the settled threads, so a match is never hidden.
  const open = settledOpen || Boolean(search);
  if (settled.length) items.push({ type: "heading", key: "heading:settled", title: "Settled", count: settled.length, toggle: "settled", open }, ...(open ? settled.map(thread) : []));
  return items;
}
