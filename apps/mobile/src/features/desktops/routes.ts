import type { Href } from "expo-router";

// A computer's chats live under the Chat tab, beside Phaseo's own chats, so they open in its stack and split view.
const ROOT = "/chat/code";
const segment = encodeURIComponent;

export const desktopChatHref = (desktopId: string, chatId: string) => `${ROOT}/${segment(desktopId)}/${segment(chatId)}` as Href;
export const newDesktopChatHref = (desktopId: string) => `${ROOT}/${segment(desktopId)}/new` as Href;

/** The computer chat a path shows, for the sidebar's selected row; null on any other screen. */
export function desktopChatInPath(pathname: string): { desktopId: string; chatId: string } | null {
  if (!pathname.startsWith(`${ROOT}/`)) return null;
  const [desktopId, chatId, extra] = pathname.slice(ROOT.length + 1).split("/");
  if (!desktopId || !chatId || extra !== undefined || chatId === "new") return null;
  try { return { desktopId: decodeURIComponent(desktopId), chatId: decodeURIComponent(chatId) }; } catch { return null; }
}
