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
// The app's haptics module (modules/phaseo-haptics), as on a phone whose motor reports no effects.
jest.mock("expo", () => {
  const module = {
    capabilities: jest.fn(() => ({ vibrator: true, amplitude: false, effects: false, primitives: false })),
    pulse: jest.fn(() => Promise.resolve()),
  };
  return { requireOptionalNativeModule: jest.fn(() => module), module };
});

const CALLS = ["performAndroidHapticsAsync", "impactAsync", "selectionAsync", "notificationAsync"] as const;
const native = jest.requireMock<Record<(typeof CALLS)[number], jest.Mock>>("expo-haptics");
const storage = jest.requireMock<{ kv: { setItem: jest.Mock } }>("@/lib/storage");
const motorModule = jest.requireMock<{ module: { capabilities: jest.Mock; pulse: jest.Mock } }>("expo").module;
// Loaded after the mocks.
const {
  ANDROID_HAPTICS, ANDROID_PULSES, IOS_HAPTICS, MIN_GAP_MS, androidHaptic, androidRoute, haptic, hapticsStore, motorCapabilities, play, setHapticsEnabled, shouldPlay,
} = jest.requireActual<typeof import("./haptics")>("./haptics");
type Motor = NonNullable<ReturnType<typeof motorCapabilities>>;
/** A Pixel-like motor with every effect, and the Galaxy A53's, which reports none. */
const FULL: Motor = { vibrator: true, amplitude: true, effects: true, primitives: true };
const BARE: Motor = { vibrator: true, amplitude: false, effects: false, primitives: false };
type Kind = keyof typeof ANDROID_HAPTICS;

const KINDS = Object.keys(ANDROID_HAPTICS) as Kind[];
const playedCount = () => CALLS.reduce((sum, name) => sum + native[name].mock.calls.length, 0);

beforeEach(() => {
  for (const name of CALLS) native[name].mockClear();
  motorModule.pulse.mockClear();
  storage.kv.setItem.mockClear();
  hapticsStore.set({ enabled: true });
});

describe("Android effects", () => {
  it("use the system's newest effects on Android 14 and later", () => {
    expect(androidHaptic("selection", 36, true)).toBe(AndroidHaptics.Segment_Tick);
    expect(androidHaptic("tick", 34, true)).toBe(AndroidHaptics.Segment_Frequent_Tick);
    expect(androidHaptic("toggleOn", 34, true)).toBe(AndroidHaptics.Toggle_On);
    expect(androidHaptic("toggleOff", 34, true)).toBe(AndroidHaptics.Toggle_Off);
    expect(androidHaptic("lift", 36, true)).toBe(AndroidHaptics.Drag_Start);
    expect(androidHaptic("success", 36, true)).toBe(AndroidHaptics.Confirm);
    expect(androidHaptic("error", 36, true)).toBe(AndroidHaptics.Reject);
    expect(androidHaptic("longPress", 36, true)).toBe(AndroidHaptics.Long_Press);
  });

  it("skip Android 14's composed effects on a motor without primitives", () => {
    expect(androidHaptic("selection", 36, false)).toBe(AndroidHaptics.Clock_Tick);
    expect(androidHaptic("toggleOn", 36, false)).toBe(AndroidHaptics.Context_Click);
    expect(androidHaptic("lift", 36, false)).toBe(AndroidHaptics.Long_Press);
    expect(androidHaptic("success", 36, false)).toBe(AndroidHaptics.Confirm);
  });

  it("fall back to effects older phones have", () => {
    // Android 11 to 13 have Confirm and Reject but not the toggle and segment effects.
    expect(androidHaptic("toggleOn", 33, true)).toBe(AndroidHaptics.Context_Click);
    expect(androidHaptic("selection", 30, true)).toBe(AndroidHaptics.Clock_Tick);
    expect(androidHaptic("success", 30, true)).toBe(AndroidHaptics.Confirm);
    // Android 7 to 10 (the app's minimum is 7, API 24).
    expect(androidHaptic("success", 29, true)).toBe(AndroidHaptics.Virtual_Key);
    expect(androidHaptic("error", 24, true)).toBe(AndroidHaptics.Long_Press);
    expect(androidHaptic("lift", 24, true)).toBe(AndroidHaptics.Long_Press);
    expect(androidHaptic("drop", 24, true)).toBe(AndroidHaptics.Clock_Tick);
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

describe("touch pulses", () => {
  it("are short taps, each a wait then alternating on and off, with a strength per segment", () => {
    for (const kind of KINDS) {
      const { timings, amplitudes } = ANDROID_PULSES[kind];
      expect(timings).toHaveLength(amplitudes.length);
      expect(timings[0]).toBe(0);
      expect(timings.length % 2).toBe(0);
      // On segments are long enough for a slow motor to be felt, and the whole thing is over in a fifth of a second.
      for (let index = 1; index < timings.length; index += 2) {
        expect(timings[index]).toBeGreaterThanOrEqual(12);
        expect(amplitudes[index]).toBeGreaterThan(0);
        expect(amplitudes[index]).toBeLessThanOrEqual(255);
      }
      for (let index = 0; index < timings.length; index += 2) expect(amplitudes[index]).toBe(0);
      expect(timings.reduce((sum, ms) => sum + ms, 0)).toBeLessThanOrEqual(200);
    }
    // The system's long press on those phones is one 45 ms pulse; a tick is the lightest.
    expect(ANDROID_PULSES.longPress.timings).toEqual([0, 45]);
    expect(Math.min(...KINDS.map((kind) => ANDROID_PULSES[kind].timings[1]!))).toBe(ANDROID_PULSES.tick.timings[1]);
  });
});

describe("play", () => {
  it("chooses the system's effects or touch pulses by what the motor reports", () => {
    expect(androidRoute(FULL)).toBe("system");
    expect(androidRoute(BARE)).toBe("pulse");
    // Android can't tell (before Android 11): the system's effects, which have fallbacks there.
    expect(androidRoute({ ...BARE, effects: null, primitives: null })).toBe("system");
    expect(androidRoute({ ...BARE, vibrator: false })).toBe("none");
    // A build without the module.
    expect(androidRoute(null)).toBe("system");
  });

  it("uses the system effect on a motor that has it, never the media vibration calls", () => {
    play("toggleOn", "android", 36, FULL);
    expect(native.performAndroidHapticsAsync).toHaveBeenCalledWith(AndroidHaptics.Toggle_On);
    for (const kind of KINDS) play(kind, "android", 36, FULL);
    expect(motorModule.pulse).not.toHaveBeenCalled();
    expect(native.impactAsync).not.toHaveBeenCalled();
    expect(native.selectionAsync).not.toHaveBeenCalled();
    expect(native.notificationAsync).not.toHaveBeenCalled();
  });

  it("plays touch pulses on a motor without effects, like the Galaxy A53's", () => {
    play("toggleOn", "android", 36, BARE);
    expect(motorModule.pulse).toHaveBeenCalledWith([0, 22], [0, 170]);
    play("success", "android", 36, BARE);
    expect(motorModule.pulse).toHaveBeenLastCalledWith([...ANDROID_PULSES.success.timings], [...ANDROID_PULSES.success.amplitudes]);
    expect(native.performAndroidHapticsAsync).not.toHaveBeenCalled();
    // No motor: nothing.
    play("thud", "android", 36, { ...BARE, vibrator: false });
    expect(motorModule.pulse).toHaveBeenCalledTimes(2);
  });

  it("asks the motor once", () => {
    expect(motorCapabilities()).toEqual(BARE);
    motorCapabilities();
    expect(motorModule.capabilities).toHaveBeenCalledTimes(1);
  });

  it("uses the feedback generators on iOS", () => {
    play("tick", "ios", 0, null);
    expect(native.selectionAsync).toHaveBeenCalledTimes(1);
    play("success", "ios", 0, null);
    expect(native.notificationAsync).toHaveBeenCalledWith(NotificationFeedbackType.Success);
    play("thud", "ios", 0, null);
    expect(native.impactAsync).toHaveBeenCalledWith(ImpactFeedbackStyle.Heavy);
    expect(Object.keys(IOS_HAPTICS).sort()).toEqual([...KINDS].sort());
    expect(native.performAndroidHapticsAsync).not.toHaveBeenCalled();
  });

  it("does nothing on the web, and never throws when the native call fails", async () => {
    play("success", "web", 0, null);
    expect(playedCount()).toBe(0);
    native.performAndroidHapticsAsync.mockReturnValueOnce(Promise.reject(new Error("not supported")));
    expect(() => play("selection", "android", 24, null)).not.toThrow();
    motorModule.pulse.mockReturnValueOnce(Promise.reject(new Error("no motor")));
    expect(() => play("selection", "android", 36, BARE)).not.toThrow();
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
