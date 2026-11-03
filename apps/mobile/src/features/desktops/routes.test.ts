import { notificationTarget } from "@/features/notifications/links";
import { desktopChatHref, desktopChatInPath, desktopFilesHref, desktopGitHref, desktopPullRequestHref, desktopPullRequestsHref, desktopReviewHref, newDesktopChatHref } from "./routes";

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
    expect(desktopReviewHref("desk-1", "a/b", "turn", "m 1")).toBe("/code/desk-1/review?chatId=a%2Fb&scope=turn&messageId=m%201");
    expect(desktopFilesHref("desk-1", { chatId: "a/b" })).toBe("/code/desk-1/files?chatId=a%2Fb");
    expect(desktopFilesHref("desk-1", { projectId: "p 1" }, "Phaseo", "src/a b.ts")).toBe("/code/desk-1/files?projectId=p%201&where=Phaseo&path=src%2Fa%20b.ts");
    expect(desktopGitHref("desk-1", "p/1", "a/b", "Phaseo")).toBe("/code/desk-1/git?projectId=p%2F1&chatId=a%2Fb&where=Phaseo");
    expect(desktopPullRequestsHref("desk-1")).toBe("/code/desk-1/pull-requests");
    expect(desktopPullRequestHref("desk-1", "p1", 12)).toBe("/code/desk-1/pull-request?projectId=p1&number=12");
  });

  it("reads the open thread back from the path, for the list's selected row", () => {
    expect(desktopChatInPath("/code/desk-1/c2")).toEqual({ desktopId: "desk-1", chatId: "c2" });
    expect(desktopChatInPath("/code/desk%201/a%2Fb")).toEqual({ desktopId: "desk 1", chatId: "a/b" });
    expect(desktopChatInPath("/code/desk-1/new")).toBeNull();
    expect(desktopChatInPath("/code/desk-1/review")).toBeNull();
    expect(desktopChatInPath("/code/desk-1/files")).toBeNull();
    for (const screen of ["git", "pull-requests", "pull-request"]) expect(desktopChatInPath(`/code/desk-1/${screen}`)).toBeNull();
    expect(desktopChatInPath("/chat/c2")).toBeNull();
    expect(desktopChatInPath("/code/desk-1")).toBeNull();
  });
});
