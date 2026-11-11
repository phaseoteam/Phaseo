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

type PickedModule = typeof import("./picked");
const load = () => {
  let loaded: PickedModule | undefined;
  jest.isolateModules(() => { loaded = jest.requireActual<PickedModule>("./picked"); });
  return loaded!;
};
const settle = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  saved.clear();
  jest.clearAllMocks();
});

describe("the workspace the app works in", () => {
  it("starts in Phaseo and remembers a computer for the next launch", async () => {
    const first = load();
    release();
    await settle();
    expect(first.workspaceStore.get()).toEqual({ kind: "phaseo" });
    first.chooseDesktop("desk-2");
    const next = load();
    release();
    await settle();
    expect(next.workspaceStore.get()).toEqual({ kind: "desktop", desktopId: "desk-2" });
    next.choosePhaseo();
    const third = load();
    release();
    await settle();
    expect(third.workspaceStore.get()).toEqual({ kind: "phaseo" });
  });

  it("keeps a choice made before storage answers", async () => {
    saved.set("phaseo.workspace", JSON.stringify({ kind: "desktop", desktopId: "desk-1" }));
    const picked = load();
    picked.chooseDesktop("desk-3");
    release();
    await settle();
    expect(picked.workspaceStore.get()).toEqual({ kind: "desktop", desktopId: "desk-3" });
  });

  it("reads damaged stored values as Phaseo", () => {
    const { readWorkspace } = load();
    expect(readWorkspace("not json")).toEqual({ kind: "phaseo" });
    expect(readWorkspace(JSON.stringify({ kind: "desktop", desktopId: 4 }))).toEqual({ kind: "phaseo" });
  });

  it("is the chosen computer while it's paired, and Phaseo once it's removed", () => {
    const { workspaceDesktop } = load();
    const desktops = [{ desktopId: "desk-1" }, { desktopId: "desk-2" }];
    expect(workspaceDesktop(desktops, { kind: "desktop", desktopId: "desk-2" })).toEqual({ desktopId: "desk-2" });
    expect(workspaceDesktop(desktops, { kind: "desktop", desktopId: "removed" })).toBeNull();
    expect(workspaceDesktop(desktops, { kind: "phaseo" })).toBeNull();
    expect(workspaceDesktop(null, { kind: "desktop", desktopId: "desk-1" })).toBeNull();
  });
});
