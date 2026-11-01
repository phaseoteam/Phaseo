const saved = new Map<string, string>();
let release: () => void = () => undefined;
const mockKv = {
  // Reads wait for the test, so a choice can be made before storage answers.
  getItem: jest.fn((key: string) => {
    const value = saved.get(key) ?? null;
    return new Promise<string | null>((resolve) => { release = () => resolve(value); });
  }),
  setItem: jest.fn(async (key: string, value: string) => { saved.set(key, value); }),
};
jest.mock("@/lib/storage", () => ({ kv: mockKv }));

type SidebarModule = typeof import("./sidebar");
const load = () => {
  let loaded: SidebarModule | undefined;
  jest.isolateModules(() => { loaded = jest.requireActual<SidebarModule>("./sidebar"); });
  return loaded!;
};
const settle = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  saved.clear();
  jest.clearAllMocks();
});

describe("the Chat | Code switch", () => {
  it("starts on Chat and remembers Code and the picked computer for the next launch", async () => {
    const first = load();
    release();
    await settle();
    expect(first.sidebarStore.get()).toEqual({ mode: "chat", desktopId: null });

    first.chooseDesktop("desk-2");
    expect(first.sidebarStore.get()).toEqual({ mode: "code", desktopId: "desk-2" });

    const next = load();
    release();
    await settle();
    expect(next.sidebarStore.get()).toEqual({ mode: "code", desktopId: "desk-2" });

    next.chooseSidebarMode("chat");
    const third = load();
    release();
    await settle();
    // Going back to Chat keeps the computer picked for the next time Code shows.
    expect(third.sidebarStore.get()).toEqual({ mode: "chat", desktopId: "desk-2" });
  });

  it("keeps a choice made before storage answers", async () => {
    saved.set("phaseo.chat.sidebar", JSON.stringify({ mode: "chat", desktopId: null }));
    const sidebar = load();
    sidebar.chooseSidebarMode("code");
    release();
    await settle();
    expect(sidebar.sidebarStore.get().mode).toBe("code");
  });

  it("reads damaged or unknown stored values as Chat", () => {
    const { readSidebarState } = load();
    expect(readSidebarState("not json")).toEqual({ mode: "chat", desktopId: null });
    expect(readSidebarState(JSON.stringify({ mode: "plan", desktopId: 4 }))).toEqual({ mode: "chat", desktopId: null });
  });
});

describe("the picked computer", () => {
  const desktops = [{ desktopId: "desk-1" }, { desktopId: "desk-2" }];
  it("is the remembered one while it's paired, else the first", () => {
    const { chosenDesktop } = load();
    expect(chosenDesktop(desktops, "desk-2")).toEqual({ desktopId: "desk-2" });
    expect(chosenDesktop(desktops, "removed")).toEqual({ desktopId: "desk-1" });
    expect(chosenDesktop(desktops, null)).toEqual({ desktopId: "desk-1" });
    expect(chosenDesktop([], "desk-1")).toBeNull();
  });
});

describe("New chat", () => {
  it("starts a Phaseo chat, a chat on the picked computer, or pairing when none is paired", () => {
    const { newChatHref } = load();
    expect(newChatHref("chat", "desk-1")).toBe("/chat/new");
    expect(newChatHref("code", "desk-1")).toBe("/chat/code/desk-1/new");
    expect(newChatHref("code", null)).toBe("/pair");
  });
});
