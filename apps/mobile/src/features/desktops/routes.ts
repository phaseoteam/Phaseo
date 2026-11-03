import type { Href } from "expo-router";

// Code is its own section over Chat: the list at /code, each thread pushed over it.
export const CODE_HREF = "/code";
const segment = encodeURIComponent;

export const desktopChatHref = (desktopId: string, chatId: string) => `${CODE_HREF}/${segment(desktopId)}/${segment(chatId)}` as Href;
/** A new thread on a computer, in a project when one is given. */
export const newDesktopChatHref = (desktopId: string, projectId?: string | null) => `${CODE_HREF}/${segment(desktopId)}/new${projectId ? `?projectId=${segment(projectId)}` : ""}` as Href;

/** A thread's changes, in a scope; a turn names the person's message that started it, else the latest. */
export const desktopReviewHref = (desktopId: string, chatId: string, scope: "uncommitted" | "branch" | "turn" = "uncommitted", messageId?: string) => `${CODE_HREF}/${segment(desktopId)}/review?chatId=${segment(chatId)}&scope=${scope}${messageId ? `&messageId=${segment(messageId)}` : ""}` as Href;

/** A thread's or a project's files on a computer, headed by the project's name (`where`); with a path, that file's preview. */
export const desktopFilesHref = (desktopId: string, target: { chatId: string } | { projectId: string }, where?: string | null, path?: string) =>
  `${CODE_HREF}/${segment(desktopId)}/files?${"chatId" in target ? `chatId=${segment(target.chatId)}` : `projectId=${segment(target.projectId)}`}${where ? `&where=${segment(where)}` : ""}${path ? `&path=${segment(path)}` : ""}` as Href;

/** The computer thread a path shows, for the list's selected row; null on any other screen. */
export function desktopChatInPath(pathname: string): { desktopId: string; chatId: string } | null {
  if (!pathname.startsWith(`${CODE_HREF}/`)) return null;
  const [desktopId, chatId, extra] = pathname.slice(CODE_HREF.length + 1).split("/");
  if (!desktopId || !chatId || extra !== undefined || chatId === "new" || chatId === "review" || chatId === "files") return null;
  try { return { desktopId: decodeURIComponent(desktopId), chatId: decodeURIComponent(chatId) }; } catch { return null; }
}
