import { changesLabel, chatItems, mergeArchived, mergeChat, mergeDetail, settingsChange, workLogSummary } from "./chatState";
import { codeListItems } from "./codeList";
import type { PhoneActivity, PhoneChat, PhoneChatDetail, PhoneEntry } from "./protocol";
import { menuEntries, reverseOf, snoozeChoices, swipeActions } from "./threadActions";

const chat = (id: string, more: Partial<PhoneChat> = {}): PhoneChat => ({ id, title: id, mode: "code", status: "completed", updatedAt: "2026-11-01T10:00:00Z", unread: false, needsYou: false, ...more });
const tool = (id: string, more: Partial<PhoneActivity> = {}): PhoneActivity => ({ kind: "activity", id, type: "tool", title: `Ran ${id}`, text: "", status: "completed", ...more });

describe("organising a computer's threads", () => {
  it("undoes each change with its reverse, from the thread as it was", () => {
    expect(reverseOf({ action: "settle" }, chat("a"))).toEqual([{ action: "unsettle" }]);
    expect(reverseOf({ action: "archive" }, chat("a"))).toEqual([{ action: "unarchive" }]);
    expect(reverseOf({ action: "pin" }, chat("a"))).toEqual([{ action: "unpin" }]);
    expect(reverseOf({ action: "rename", title: "New" }, chat("a", { title: "Old" }))).toEqual([{ action: "rename", title: "Old" }]);
    expect(reverseOf({ action: "snooze", until: "2099-01-01T09:00:00.000Z" }, chat("a"))).toEqual([{ action: "wake" }]);
    // Snoozing again puts back the earlier time.
    expect(reverseOf({ action: "snooze", until: "2099-01-02T09:00:00.000Z" }, chat("a", { snoozedUntil: "2099-01-01T09:00:00.000Z" }))).toEqual([{ action: "snooze", until: "2099-01-01T09:00:00.000Z" }]);
    expect(reverseOf({ action: "mark-unread" }, chat("a"))).toBeNull();
  });

  it("puts back what the computer changed alongside: pinning unsettles and wakes, settling unpins", () => {
    const until = "2099-01-01T09:00:00.000Z";
    expect(reverseOf({ action: "pin" }, chat("a", { settled: true }))).toEqual([{ action: "unpin" }, { action: "settle" }]);
    expect(reverseOf({ action: "pin" }, chat("a", { snoozedUntil: until }))).toEqual([{ action: "unpin" }, { action: "snooze", until }]);
    expect(reverseOf({ action: "settle" }, chat("a", { pinned: true }))).toEqual([{ action: "unsettle" }, { action: "pin" }]);
    // Pinning again in the undo wakes a snoozed thread, so its snooze follows.
    expect(reverseOf({ action: "settle" }, chat("a", { pinned: true, snoozedUntil: until }))).toEqual([{ action: "unsettle" }, { action: "pin" }, { action: "snooze", until }]);
    expect(reverseOf({ action: "unpin" }, chat("a", { pinned: true, snoozedUntil: until }))).toEqual([{ action: "pin" }, { action: "snooze", until }]);
    // A snooze that has passed stays woken.
    expect(reverseOf({ action: "pin" }, chat("a", { snoozedUntil: "2000-01-01T00:00:00.000Z" }))).toEqual([{ action: "unpin" }]);
  });

  it("asks the computer for the default effort back, and nothing when nothing changed", () => {
    expect(settingsChange({ model: "m", reasoningEffort: "high" }, { model: "m", effort: null })).toEqual({ defaultEffort: true });
    expect(settingsChange({ model: "m" }, { model: "m", effort: null })).toBeNull();
    expect(settingsChange({ model: "m", reasoningEffort: "high" }, { model: "m", effort: "high" })).toBeNull();
    expect(settingsChange({ model: "m" }, { model: "m", effort: "low" })).toEqual({ reasoningEffort: "low" });
    expect(settingsChange({ model: "m", reasoningEffort: "high" }, { model: "n", effort: null })).toEqual({ model: "n" });
  });

  it("offers the window's swipe buttons for an active, snoozed and settled thread, the main one last", () => {
    expect(swipeActions(chat("a")).map((action) => action.label)).toEqual(["Snooze", "Settle"]);
    expect(swipeActions(chat("a", { snoozedUntil: "2099-01-01T00:00:00Z" })).map((action) => action.label)).toEqual(["Archive", "Wake"]);
    expect(swipeActions(chat("a", { settled: true })).map((action) => action.label)).toEqual(["Unsettle", "Archive"]);
    // Settling is Code's; a Chat pins or archives, as in the window's Chat sidebar.
    expect(swipeActions(chat("a", { mode: "chat" })).map((action) => action.label)).toEqual(["Pin", "Archive"]);
    expect(swipeActions(chat("a", { mode: "chat", pinned: true })).map((action) => action.label)).toEqual(["Unpin", "Archive"]);
  });

  it("lists the long-press menu in the window's order, leaving out what doesn't apply", () => {
    expect(menuEntries(chat("a")).map((entry) => entry.label)).toEqual(["Pin", "Rename", "Mark unread", "Snooze…", "Settle", "Archive"]);
    expect(menuEntries(chat("a", { pinned: true, unread: true, settled: true })).map((entry) => entry.label)).toEqual(["Unpin", "Rename", "Snooze…", "Unsettle", "Archive"]);
    expect(menuEntries(chat("a", { mode: "chat" })).map((entry) => entry.label)).toEqual(["Pin", "Rename", "Mark unread", "Archive"]);
    expect(menuEntries(chat("a", { mode: "chat", settled: true })).map((entry) => entry.label)).toEqual(["Pin", "Rename", "Mark unread", "Unsettle", "Archive"]);
  });

  it("snoozes until the window's times", () => {
    // A Wednesday afternoon: this evening is over an hour away, next week is Monday.
    const choices = snoozeChoices(new Date(2026, 10, 4, 14, 0));
    expect(choices.map((choice) => choice.label)).toEqual(["In 1 hour", "In 3 hours", "This evening", "Tomorrow", "Next week"]);
    expect(new Date(choices[3]!.until).getHours()).toBe(9);
    expect(new Date(choices[4]!.until).getDay()).toBe(1);
    // Late on a Sunday, tomorrow is Monday, so there's no separate next week.
    expect(snoozeChoices(new Date(2026, 10, 8, 20, 0)).map((choice) => choice.label)).toEqual(["In 1 hour", "In 3 hours", "Tomorrow"]);
  });

  it("drops an archived thread from the list and keeps the archive's own list in step", () => {
    const list = [chat("a"), chat("b")];
    expect(mergeChat(list, chat("a", { archived: true })).map((entry) => entry.id)).toEqual(["b"]);
    expect(mergeArchived([chat("c", { archived: true })], chat("a", { archived: true, updatedAt: "2026-11-02T00:00:00Z" })).map((entry) => entry.id)).toEqual(["a", "c"]);
    expect(mergeArchived([chat("a", { archived: true })], chat("a"))).toEqual([]);
  });

  it("files pinned threads under their own heading and folds snoozed ones, unless a search opens them", () => {
    const chats = [chat("pinned", { pinned: true, projectId: "p", project: "P" }), chat("later", { snoozedUntil: "2099-01-01T00:00:00Z" }), chat("plain", { projectId: "p", project: "P" })];
    const shape = (items: ReturnType<typeof codeListItems>) => items.map((item) => (item.type === "thread" ? item.chat.id : item.type === "folder" ? `[${item.title}]` : `# ${item.title}${item.open ? "" : " closed"}`));
    expect(shape(codeListItems(chats))).toEqual(["# Pinned", "pinned", "[P]", "plain", "# Snoozed closed"]);
    expect(shape(codeListItems(chats, { snoozedOpen: true })).slice(-2)).toEqual(["# Snoozed", "later"]);
    expect(shape(codeListItems(chats, { query: "lat" }))).toEqual(["# Snoozed", "later"]);
  });
});

describe("a computer thread's screen", () => {
  it("keeps the detail's queue, agent and permissions through a list-row update, and takes a whole detail as it is", () => {
    const detail: PhoneChatDetail = { ...chat("a"), approvals: [], questions: [], queue: [{ id: "q1", text: "Next" }], harness: "codex", permissionMode: "accept-edits", reasoningEffort: "high" };
    expect(mergeDetail(detail, chat("a", { title: "Renamed" }))).toMatchObject({ title: "Renamed", queue: [{ id: "q1" }], harness: "codex", permissionMode: "accept-edits", reasoningEffort: "high" });
    const fresh: PhoneChatDetail = { ...chat("a"), approvals: [], questions: [], queue: [] };
    expect(mergeDetail(detail, fresh)).toEqual(fresh);
  });

  it("groups a turn's steps into one work log line", () => {
    expect(workLogSummary([tool("pnpm test")])).toBe("Ran pnpm test");
    expect(workLogSummary([tool("a"), tool("b"), tool("c"), tool("d")])).toBe("Ran 4 tools");
    expect(workLogSummary([{ ...tool("r"), type: "reasoning", title: "Thinking" }, tool("a"), tool("b", { status: "running", title: "Running pnpm build" })])).toBe("Ran 2 tools · Thought · Running pnpm build");
    expect(workLogSummary([tool("a"), tool("b", { status: "failed" })])).toBe("Ran 2 tools · 1 failed");
  });

  it("ends each turn that changed files with a row saying how many", () => {
    const entries: PhoneEntry[] = [
      { kind: "message", id: "u1", role: "user", text: "Fix it", createdAt: "", changes: { files: 3, additions: 12, deletions: 4 } },
      tool("t1"),
      { kind: "message", id: "a1", role: "assistant", text: "Done", createdAt: "" },
      { kind: "message", id: "s1", role: "user", text: "Steer", createdAt: "", delivery: "steer" },
      { kind: "message", id: "u2", role: "user", text: "Now docs", createdAt: "" },
      { kind: "message", id: "a2", role: "assistant", text: "Done", createdAt: "" },
    ];
    expect(chatItems(entries).map((item) => (item.kind === "message" ? item.message.id : item.kind === "changes" ? `changes:${changesLabel(item.changes)}` : "log"))).toEqual(["u1", "log", "a1", "s1", "changes:3 files changed · +12 −4", "u2", "a2"]);
    expect(changesLabel({ files: 1, additions: -1, deletions: -1 })).toBe("1 file changed");
  });
});
