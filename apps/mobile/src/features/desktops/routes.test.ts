import { notificationTarget } from "@/features/notifications/links";
import { desktopChatHref, desktopChatInPath, newDesktopChatHref } from "./routes";

describe("computer chat routes", () => {
  it("opens a tapped approval or needs-you notification inside Chat", () => {
    const target = notificationTarget({ desktopId: "desk-1", chatId: "c2" });
    expect(target).toEqual({ kind: "desktop-chat", desktopId: "desk-1", chatId: "c2" });
    if (target?.kind !== "desktop-chat") throw new Error("not a desktop chat");
    expect(desktopChatHref(target.desktopId, target.chatId)).toBe("/chat/code/desk-1/c2");
  });

  it("keeps ids with slashes or spaces in one path segment", () => {
    expect(desktopChatHref("desk 1", "a/b")).toBe("/chat/code/desk%201/a%2Fb");
    expect(newDesktopChatHref("desk 1")).toBe("/chat/code/desk%201/new");
  });

  it("reads the open computer chat back from the path, for the sidebar's selected row", () => {
    expect(desktopChatInPath("/chat/code/desk-1/c2")).toEqual({ desktopId: "desk-1", chatId: "c2" });
    expect(desktopChatInPath("/chat/code/desk%201/a%2Fb")).toEqual({ desktopId: "desk 1", chatId: "a/b" });
    expect(desktopChatInPath("/chat/code/desk-1/new")).toBeNull();
    expect(desktopChatInPath("/chat/c2")).toBeNull();
    expect(desktopChatInPath("/chat/code/desk-1")).toBeNull();
  });
});
