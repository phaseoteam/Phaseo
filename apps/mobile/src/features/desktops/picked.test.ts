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

describe("the computer Code shows", () => {
  it("remembers the picked computer for the next launch", async () => {
    const first = load();
    release();
    await settle();
    expect(first.pickedDesktopStore.get()).toBeNull();
    first.chooseDesktop("desk-2");
    const next = load();
    release();
    await settle();
    expect(next.pickedDesktopStore.get()).toBe("desk-2");
  });

  it("keeps the computer picked under the old Chat | Code switch", async () => {
    saved.set("phaseo.chat.sidebar", JSON.stringify({ mode: "code", desktopId: "desk-1" }));
    const picked = load();
    release();
    await settle();
    expect(picked.pickedDesktopStore.get()).toBe("desk-1");
  });

  it("keeps a choice made before storage answers", async () => {
    saved.set("phaseo.chat.sidebar", JSON.stringify({ desktopId: "desk-1" }));
    const picked = load();
    picked.chooseDesktop("desk-3");
    release();
    await settle();
    expect(picked.pickedDesktopStore.get()).toBe("desk-3");
  });

  it("reads damaged stored values as nothing picked", () => {
    const { readPickedDesktop } = load();
    expect(readPickedDesktop("not json")).toBeNull();
    expect(readPickedDesktop(JSON.stringify({ desktopId: 4 }))).toBeNull();
  });

  it("is the remembered one while it's paired, else the first", () => {
    const { chosenDesktop } = load();
    const desktops = [{ desktopId: "desk-1" }, { desktopId: "desk-2" }];
    expect(chosenDesktop(desktops, "desk-2")).toEqual({ desktopId: "desk-2" });
    expect(chosenDesktop(desktops, "removed")).toEqual({ desktopId: "desk-1" });
    expect(chosenDesktop([], "desk-1")).toBeNull();
  });
});
