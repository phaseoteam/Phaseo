import { notificationTarget } from "@/features/notifications/links";
import { desktopChatHref, desktopChatInPath, newDesktopChatHref } from "./routes";

describe("Code routes", () => {
  it("opens a tapped approval or needs-you notification in Code", () => {
    const target = notificationTarget({ desktopId: "desk-1", chatId: "c2" });
    expect(target).toEqual({ kind: "desktop-chat", desktopId: "desk-1", chatId: "c2" });
    if (target?.kind !== "desktop-chat") throw new Error("not a desktop chat");
    expect(desktopChatHref(target.desktopId, target.chatId)).toBe("/code/desk-1/c2");
  });

  it("keeps ids with slashes or spaces in one path segment, and starts a new thread in a project", () => {
    expect(desktopChatHref("desk 1", "a/b")).toBe("/code/desk%201/a%2Fb");
    expect(newDesktopChatHref("desk 1")).toBe("/code/desk%201/new");
    expect(newDesktopChatHref("desk-1", "p/1")).toBe("/code/desk-1/new?projectId=p%2F1");
  });

  it("reads the open thread back from the path, for the list's selected row", () => {
    expect(desktopChatInPath("/code/desk-1/c2")).toEqual({ desktopId: "desk-1", chatId: "c2" });
    expect(desktopChatInPath("/code/desk%201/a%2Fb")).toEqual({ desktopId: "desk 1", chatId: "a/b" });
    expect(desktopChatInPath("/code/desk-1/new")).toBeNull();
    expect(desktopChatInPath("/chat/c2")).toBeNull();
    expect(desktopChatInPath("/code/desk-1")).toBeNull();
  });
});
