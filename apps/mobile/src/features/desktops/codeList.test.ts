import { codeListItems, codeStatus } from "./codeList";
import type { PhoneChat } from "./protocol";

const chat = (id: string, updatedAt: string, more: Partial<PhoneChat> = {}): PhoneChat => ({ id, title: id, mode: "code", status: "completed", updatedAt, unread: false, needsYou: false, ...more });
const shape = (items: ReturnType<typeof codeListItems>) => items.map((item) => (item.type === "thread" ? item.chat.id : item.type === "folder" ? `[${item.title}]` : `# ${item.title} (${item.count})${item.open ? "" : " closed"}`));

describe("the Code list", () => {
  const chats = [
    chat("old-api", "2026-11-01T08:00:00Z", { projectId: "api", project: "API" }),
    chat("web-fix", "2026-11-01T09:00:00Z", { projectId: "web", project: "Web", branch: "fix/login" }),
    chat("loose", "2026-11-01T12:00:00Z"),
    chat("api-new", "2026-11-01T10:00:00Z", { projectId: "api", project: "API" }),
    chat("asks", "2026-11-01T07:00:00Z", { projectId: "web", project: "Web", needsYou: true, status: "waiting" }),
    chat("approve", "2026-11-01T11:00:00Z", { needsYou: true }),
    chat("shipped", "2026-11-01T13:00:00Z", { projectId: "api", project: "API", settled: true }),
    chat("earlier", "2026-10-30T13:00:00Z", { settled: true }),
  ];

  it("puts what needs you first, then project folders by their latest thread, then settled threads folded away", () => {
    expect(shape(codeListItems(chats))).toEqual([
      "# Needs you (2)", "approve", "asks",
      "[API]", "api-new", "old-api",
      "[Web]", "web-fix",
      // Threads without a project come after the folders, however recent.
      "[No project]", "loose",
      "# Settled (2) closed",
    ]);
  });

  it("lists the settled threads, newest first, once opened", () => {
    expect(shape(codeListItems(chats, { settledOpen: true })).slice(-3)).toEqual(["# Settled (2)", "shipped", "earlier"]);
  });

  it("searches titles, projects and branches, with settled matches showing", () => {
    expect(shape(codeListItems(chats, { query: "login" }))).toEqual(["[Web]", "web-fix"]);
    expect(shape(codeListItems(chats, { query: "api" }))).toEqual(["[API]", "api-new", "old-api", "# Settled (1)", "shipped"]);
  });

  it("keeps the folder's project id for its New thread action", () => {
    const folders = codeListItems(chats).filter((item) => item.type === "folder");
    expect(folders.map((item) => item.type === "folder" && item.projectId)).toEqual(["api", "web", null]);
  });
});

describe("a thread's status", () => {
  it("reads like the desktop's sidebar, with needing you over everything", () => {
    expect(codeStatus({ needsYou: true, status: "running", unread: true })).toEqual({ kind: "needs-you", label: "Needs you" });
    expect(codeStatus({ needsYou: false, status: "running", unread: false })?.label).toBe("Working");
    expect(codeStatus({ needsYou: false, status: "failed", unread: true })?.label).toBe("Failed");
    expect(codeStatus({ needsYou: false, status: "interrupted", unread: false })?.label).toBe("Stopped");
    expect(codeStatus({ needsYou: false, status: "completed", unread: true })?.label).toBe("Done");
    // A finished thread already read shows its time instead.
    expect(codeStatus({ needsYou: false, status: "completed", unread: false })).toBeNull();
  });
});
