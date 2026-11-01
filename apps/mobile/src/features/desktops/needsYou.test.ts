import { needsYouCount, onlyDesktops, withChat, withChats, type NeedsYou } from "./needsYou";

const chat = (id: string, needsYou: boolean) => ({ id, needsYou });

describe("needs-you count", () => {
  it("counts the chats waiting on you, per computer and in total", () => {
    let state: NeedsYou = {};
    state = withChats(state, "desk-1", [chat("a", true), chat("b", false), chat("c", true)], true);
    state = withChats(state, "desk-2", [chat("x", true)], true);
    expect(needsYouCount(state, "desk-1")).toBe(2);
    expect(needsYouCount(state, "desk-2")).toBe(1);
    expect(needsYouCount(state, "desk-3")).toBe(0);
    expect(needsYouCount(state)).toBe(3);
  });

  it("follows chat updates: answered chats leave the count, new waits join it once", () => {
    let state = withChats({}, "desk-1", [chat("a", true), chat("b", false)], true);
    state = withChat(state, "desk-1", chat("a", false));
    state = withChat(state, "desk-1", chat("b", true));
    state = withChat(state, "desk-1", chat("b", true));
    state = withChat(state, "desk-1", chat("new", true));
    expect(state["desk-1"]).toEqual(["b", "new"]);
  });

  it("keeps chats outside a later page, and starts over on a fresh connection", () => {
    const known = withChats({}, "desk-1", [chat("old", true), chat("a", true)], true);
    expect(needsYouCount(withChats(known, "desk-1", [chat("a", false), chat("b", true)], false), "desk-1")).toBe(2);
    expect(needsYouCount(withChats(known, "desk-1", [chat("a", false), chat("b", true)], true), "desk-1")).toBe(1);
  });

  it("drops computers that are no longer paired", () => {
    const state = withChats(withChats({}, "desk-1", [chat("a", true)], true), "desk-2", [chat("b", true)], true);
    expect(onlyDesktops(state, ["desk-2"])).toEqual({ "desk-2": ["b"] });
    expect(needsYouCount(onlyDesktops(state, []))).toBe(0);
  });

  it("returns the same state when nothing changed, so screens don't redraw", () => {
    const state = withChats({}, "desk-1", [chat("a", true)], true);
    expect(withChats(state, "desk-1", [chat("a", true)], true)).toBe(state);
    expect(withChat(state, "desk-1", chat("a", true))).toBe(state);
    expect(withChat(state, "desk-1", chat("z", false))).toBe(state);
    expect(onlyDesktops(state, ["desk-1"])).toBe(state);
  });
});
