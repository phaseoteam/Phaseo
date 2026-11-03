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

/** A project's Git on a computer, headed by its name (`where`); from a thread, Create pull request links to it. */
export const desktopGitHref = (desktopId: string, projectId: string, chatId?: string | null, where?: string | null) =>
  `${CODE_HREF}/${segment(desktopId)}/git?projectId=${segment(projectId)}${chatId ? `&chatId=${segment(chatId)}` : ""}${where ? `&where=${segment(where)}` : ""}` as Href;
/** A computer's pull requests, in a project when one is given (else the first with a repository). */
export const desktopPullRequestsHref = (desktopId: string, projectId?: string | null, where?: string | null) =>
  `${CODE_HREF}/${segment(desktopId)}/pull-requests${projectId ? `?projectId=${segment(projectId)}${where ? `&where=${segment(where)}` : ""}` : ""}` as Href;
export const desktopPullRequestHref = (desktopId: string, projectId: string, number: number) => `${CODE_HREF}/${segment(desktopId)}/pull-request?projectId=${segment(projectId)}&number=${number}` as Href;

/** Screens under a computer that aren't threads. */
const OTHER_SCREENS = new Set(["new", "review", "files", "git", "pull-requests", "pull-request"]);

/** The computer thread a path shows, for the list's selected row; null on any other screen. */
export function desktopChatInPath(pathname: string): { desktopId: string; chatId: string } | null {
  if (!pathname.startsWith(`${CODE_HREF}/`)) return null;
  const [desktopId, chatId, extra] = pathname.slice(CODE_HREF.length + 1).split("/");
  if (!desktopId || !chatId || extra !== undefined || OTHER_SCREENS.has(chatId)) return null;
  try { return { desktopId: decodeURIComponent(desktopId), chatId: decodeURIComponent(chatId) }; } catch { return null; }
}
