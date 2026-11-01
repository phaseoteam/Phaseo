import type { Href } from "expo-router";

// Code is its own section over Chat: the list at /code, each thread pushed over it.
export const CODE_HREF = "/code";
const segment = encodeURIComponent;

export const desktopChatHref = (desktopId: string, chatId: string) => `${CODE_HREF}/${segment(desktopId)}/${segment(chatId)}` as Href;
/** A new thread on a computer, in a project when one is given. */
export const newDesktopChatHref = (desktopId: string, projectId?: string | null) => `${CODE_HREF}/${segment(desktopId)}/new${projectId ? `?projectId=${segment(projectId)}` : ""}` as Href;

/** The computer thread a path shows, for the list's selected row; null on any other screen. */
export function desktopChatInPath(pathname: string): { desktopId: string; chatId: string } | null {
  if (!pathname.startsWith(`${CODE_HREF}/`)) return null;
  const [desktopId, chatId, extra] = pathname.slice(CODE_HREF.length + 1).split("/");
  if (!desktopId || !chatId || extra !== undefined || chatId === "new") return null;
  try { return { desktopId: decodeURIComponent(desktopId), chatId: decodeURIComponent(chatId) }; } catch { return null; }
}
