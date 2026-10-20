import fs from "fs";
import path from "path";
import { AndroidHaptics, ImpactFeedbackStyle, NotificationFeedbackType } from "expo-haptics";

// The package's enums, as plain values (loading the real package needs the native runtime).
jest.mock("expo-haptics", () => ({
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy", Soft: "soft", Rigid: "rigid" },
  AndroidHaptics: Object.fromEntries([
    "Confirm", "Reject", "Gesture_Start", "Gesture_End", "Toggle_On", "Toggle_Off", "Clock_Tick", "Context_Click", "Drag_Start", "Keyboard_Tap",
    "Keyboard_Press", "Keyboard_Release", "Long_Press", "Virtual_Key", "Virtual_Key_Release", "No_Haptics", "Segment_Tick", "Segment_Frequent_Tick",
    "Text_Handle_Move",
  ].map((name) => [name, name.toLowerCase().replace(/_/g, "-")])),
  performAndroidHapticsAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("@/lib/storage", () => ({ kv: { getItemSync: jest.fn(() => null), setItem: jest.fn(() => Promise.resolve()) } }));

const CALLS = ["performAndroidHapticsAsync", "impactAsync", "selectionAsync", "notificationAsync"] as const;
const native = jest.requireMock<Record<(typeof CALLS)[number], jest.Mock>>("expo-haptics");
const storage = jest.requireMock<{ kv: { setItem: jest.Mock } }>("@/lib/storage");
// Loaded after the mocks.
const { ANDROID_HAPTICS, IOS_HAPTICS, MIN_GAP_MS, androidHaptic, haptic, hapticsStore, play, setHapticsEnabled, shouldPlay } = jest.requireActual<typeof import("./haptics")>("./haptics");
type Kind = keyof typeof ANDROID_HAPTICS;

const KINDS = Object.keys(ANDROID_HAPTICS) as Kind[];
const playedCount = () => CALLS.reduce((sum, name) => sum + native[name].mock.calls.length, 0);

beforeEach(() => {
  for (const name of CALLS) native[name].mockClear();
  storage.kv.setItem.mockClear();
  hapticsStore.set({ enabled: true });
});

describe("Android effects", () => {
  it("use the system's newest effects on Android 14 and later", () => {
    expect(androidHaptic("selection", 36)).toBe(AndroidHaptics.Segment_Tick);
    expect(androidHaptic("tick", 34)).toBe(AndroidHaptics.Segment_Frequent_Tick);
    expect(androidHaptic("toggleOn", 34)).toBe(AndroidHaptics.Toggle_On);
    expect(androidHaptic("toggleOff", 34)).toBe(AndroidHaptics.Toggle_Off);
    expect(androidHaptic("lift", 36)).toBe(AndroidHaptics.Drag_Start);
    expect(androidHaptic("success", 36)).toBe(AndroidHaptics.Confirm);
    expect(androidHaptic("error", 36)).toBe(AndroidHaptics.Reject);
    expect(androidHaptic("longPress", 36)).toBe(AndroidHaptics.Long_Press);
  });

  it("fall back to effects older phones have", () => {
    // Android 11 to 13 have Confirm and Reject but not the toggle and segment effects.
    expect(androidHaptic("toggleOn", 33)).toBe(AndroidHaptics.Context_Click);
    expect(androidHaptic("selection", 30)).toBe(AndroidHaptics.Clock_Tick);
    expect(androidHaptic("success", 30)).toBe(AndroidHaptics.Confirm);
    // Android 7 to 10 (the app's minimum is 7, API 24).
    expect(androidHaptic("success", 29)).toBe(AndroidHaptics.Virtual_Key);
    expect(androidHaptic("error", 24)).toBe(AndroidHaptics.Long_Press);
    expect(androidHaptic("lift", 24)).toBe(AndroidHaptics.Long_Press);
    expect(androidHaptic("drop", 24)).toBe(AndroidHaptics.Clock_Tick);
  });

  it("have one every Android can play for every kind, after newer ones in order", () => {
    for (const kind of KINDS) {
      const options = ANDROID_HAPTICS[kind];
      expect(options.at(-1)![1]).toBe(0);
      const since = options.map(([, level]) => level);
      expect([...since].sort((a, b) => b - a)).toEqual(since);
    }
  });
});

describe("play", () => {
  it("uses the system effect on Android, never the vibration motor", () => {
    play("toggleOn", "android", 36);
    expect(native.performAndroidHapticsAsync).toHaveBeenCalledWith(AndroidHaptics.Toggle_On);
    for (const kind of KINDS) play(kind, "android", 36);
    expect(native.impactAsync).not.toHaveBeenCalled();
    expect(native.selectionAsync).not.toHaveBeenCalled();
    expect(native.notificationAsync).not.toHaveBeenCalled();
  });

  it("uses the feedback generators on iOS", () => {
    play("tick", "ios", 0);
    expect(native.selectionAsync).toHaveBeenCalledTimes(1);
    play("success", "ios", 0);
    expect(native.notificationAsync).toHaveBeenCalledWith(NotificationFeedbackType.Success);
    play("thud", "ios", 0);
    expect(native.impactAsync).toHaveBeenCalledWith(ImpactFeedbackStyle.Heavy);
    expect(Object.keys(IOS_HAPTICS).sort()).toEqual([...KINDS].sort());
    expect(native.performAndroidHapticsAsync).not.toHaveBeenCalled();
  });

  it("does nothing on the web, and never throws when the native call fails", async () => {
    play("success", "web", 0);
    expect(playedCount()).toBe(0);
    native.performAndroidHapticsAsync.mockReturnValueOnce(Promise.reject(new Error("not supported")));
    expect(() => play("selection", "android", 24)).not.toThrow();
    await Promise.resolve();
  });
});

describe("haptic", () => {
  let now = 1_000_000;
  beforeEach(() => {
    now += 10_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
  });
  afterEach(() => jest.restoreAllMocks());

  it("never plays two within MIN_GAP_MS, so bursts stay ticks", () => {
    expect(shouldPlay(null, 0)).toBe(true);
    expect(shouldPlay(100, 100 + MIN_GAP_MS - 1)).toBe(false);
    expect(shouldPlay(100, 100 + MIN_GAP_MS)).toBe(true);
    haptic("success");
    now += 5;
    // A toast's haptic straight after a copy's: one plays.
    haptic("success");
    expect(playedCount()).toBe(1);
    now += MIN_GAP_MS;
    haptic("tick");
    expect(playedCount()).toBe(2);
  });

  it("plays nothing when turned off here, and the setting is kept on the device", () => {
    setHapticsEnabled(false);
    expect(storage.kv.setItem).toHaveBeenLastCalledWith("phaseo.haptics", "off");
    haptic("success");
    haptic("longPress");
    expect(playedCount()).toBe(0);
    // Turning it back on plays one, so it's clear what the setting does.
    setHapticsEnabled(true);
    expect(storage.kv.setItem).toHaveBeenLastCalledWith("phaseo.haptics", "on");
    expect(playedCount()).toBe(1);
  });
});

describe("the rule", () => {
  it("nothing but src/lib/haptics.ts uses expo-haptics", () => {
    const root = path.resolve(__dirname, "../..");
    const list = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return list(full);
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
    });
    const users = ["src", "app"].flatMap((dir) => list(path.join(root, dir)))
      .filter((file) => /from "expo-haptics"/.test(fs.readFileSync(file, "utf8")))
      .map((file) => path.relative(root, file).replace(/\\/g, "/"));
    expect(users).toEqual(["src/lib/haptics.ts"]);
  });
});
