import { requireOptionalNativeModule } from "expo";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { kv } from "@/lib/storage";
import { createStore } from "@/lib/store";

/**
 * Haptics by what happened, so the same moment feels the same everywhere. Call `haptic(kind)`; don't use
 * expo-haptics directly (src/lib/haptics.test.ts checks).
 *
 * Android plays the system's own effects (`View.performHapticFeedback`), the ones its keyboard, switches and launcher
 * use: tuned for each phone's motor, and off when the phone's touch vibration is off. Effects Android added later
 * (11 and 14) fall back to older ones on older phones. But some motors can't play those effects at all, and Android
 * then drops them silently (a Galaxy A53 reports no effects, so nearly every system haptic is ignored there, the
 * system's own included). On those phones the app plays short pulses instead, as touch feedback, through its own module
 * (modules/phaseo-haptics), which asks the motor what it can do. Not expo-haptics' impact, selection and notification
 * calls: on Android they drive the motor with fixed patterns as media, so the phone's touch vibration settings don't
 * apply. iOS plays its feedback generators.
 *
 * Haptics mark moments, not every tap: a choice made, a switch flipped, a long press caught, a message sent, its answer
 * streaming in (`streamTick`), an outcome (done, copied, saved, failed), and a few physical ones in the version art.
 * Plain buttons and navigation stay quiet, as they do in the system's own apps and popular chat apps. Two haptics never
 * play within MIN_GAP_MS of each other, so a burst of events (a scrub across a chart, logos colliding, a toast after a
 * copy) can't turn into a buzz.
 */

export type HapticKind =
  /** One option chosen among several: a segment, a filter chip, a picker row. */
  | "selection"
  /** A fine step while scrubbing or sliding: a chart's next point, a slider's next value. */
  | "tick"
  /** A switch turned on, or off. */
  | "toggleOn"
  | "toggleOff"
  /** A long press caught (it opened a menu, or did its thing). */
  | "longPress"
  /** A deliberate press with a result to come: sending a message, stopping an answer. */
  | "press"
  /** It worked: copied, saved, an answer finished, a right guess. */
  | "success"
  /** It didn't, or it can't: an error, a wrong guess, a pick that isn't allowed. */
  | "error"
  /** Something picked up to drag, and put down again. */
  | "lift"
  | "drop"
  /** Light and hard hits, for things that collide (the version art's logos). */
  | "bump"
  | "thud";

/** Android API levels: 30 is Android 11, 34 is Android 14. */
const R = 30;
const U = 34;

/**
 * Each kind's Android effect: the best one first, with the Android version it needs, then fallbacks. The last needs
 * nothing (every Android has it).
 */
export const ANDROID_HAPTICS: Record<HapticKind, readonly (readonly [Haptics.AndroidHaptics, number])[]> = {
  selection: [[Haptics.AndroidHaptics.Segment_Tick, U], [Haptics.AndroidHaptics.Clock_Tick, 0]],
  tick: [[Haptics.AndroidHaptics.Segment_Frequent_Tick, U], [Haptics.AndroidHaptics.Clock_Tick, 0]],
  toggleOn: [[Haptics.AndroidHaptics.Toggle_On, U], [Haptics.AndroidHaptics.Context_Click, 0]],
  toggleOff: [[Haptics.AndroidHaptics.Toggle_Off, U], [Haptics.AndroidHaptics.Clock_Tick, 0]],
  longPress: [[Haptics.AndroidHaptics.Long_Press, 0]],
  press: [[Haptics.AndroidHaptics.Virtual_Key, 0]],
  success: [[Haptics.AndroidHaptics.Confirm, R], [Haptics.AndroidHaptics.Virtual_Key, 0]],
  error: [[Haptics.AndroidHaptics.Reject, R], [Haptics.AndroidHaptics.Long_Press, 0]],
  lift: [[Haptics.AndroidHaptics.Drag_Start, U], [Haptics.AndroidHaptics.Long_Press, 0]],
  drop: [[Haptics.AndroidHaptics.Gesture_End, R], [Haptics.AndroidHaptics.Clock_Tick, 0]],
  bump: [[Haptics.AndroidHaptics.Segment_Tick, U], [Haptics.AndroidHaptics.Clock_Tick, 0]],
  thud: [[Haptics.AndroidHaptics.Virtual_Key, 0]],
};

/**
 * Each kind as touch pulses, for phones whose motor can't play the system's effects: on and off times (ms, starting
 * with the wait before the first pulse) and each segment's strength (0 to 255, used where the motor can vary it). The
 * system's own long press on those phones is one 45 ms pulse; taps are shorter, but at least 20 ms: a slow motor
 * barely spins up in less, so shorter taps were hard to feel.
 */
export const ANDROID_PULSES: Record<HapticKind, { timings: readonly number[]; amplitudes: readonly number[] }> = {
  selection: { timings: [0, 26], amplitudes: [0, 140] },
  tick: { timings: [0, 20], amplitudes: [0, 110] },
  toggleOn: { timings: [0, 32], amplitudes: [0, 200] },
  toggleOff: { timings: [0, 26], amplitudes: [0, 150] },
  longPress: { timings: [0, 45], amplitudes: [0, 210] },
  press: { timings: [0, 30], amplitudes: [0, 180] },
  success: { timings: [0, 24, 90, 36], amplitudes: [0, 170, 0, 240] },
  error: { timings: [0, 45, 70, 45], amplitudes: [0, 240, 0, 240] },
  lift: { timings: [0, 40], amplitudes: [0, 200] },
  drop: { timings: [0, 26], amplitudes: [0, 150] },
  bump: { timings: [0, 22], amplitudes: [0, 150] },
  thud: { timings: [0, 50], amplitudes: [0, 255] },
};

type IosHaptic =
  | { kind: "selection" }
  | { kind: "impact"; style: Haptics.ImpactFeedbackStyle }
  | { kind: "notification"; type: Haptics.NotificationFeedbackType };

/** Each kind's iOS feedback generator. */
export const IOS_HAPTICS: Record<HapticKind, IosHaptic> = {
  selection: { kind: "selection" },
  tick: { kind: "selection" },
  toggleOn: { kind: "impact", style: Haptics.ImpactFeedbackStyle.Light },
  toggleOff: { kind: "impact", style: Haptics.ImpactFeedbackStyle.Light },
  longPress: { kind: "impact", style: Haptics.ImpactFeedbackStyle.Medium },
  press: { kind: "impact", style: Haptics.ImpactFeedbackStyle.Light },
  success: { kind: "notification", type: Haptics.NotificationFeedbackType.Success },
  error: { kind: "notification", type: Haptics.NotificationFeedbackType.Error },
  lift: { kind: "impact", style: Haptics.ImpactFeedbackStyle.Medium },
  drop: { kind: "impact", style: Haptics.ImpactFeedbackStyle.Soft },
  bump: { kind: "impact", style: Haptics.ImpactFeedbackStyle.Light },
  thud: { kind: "impact", style: Haptics.ImpactFeedbackStyle.Heavy },
};

/**
 * The Android effect for a kind on a given Android version (API level). Android 14's effects are composed from
 * primitives, so they're skipped when the motor has none (`primitives` false).
 */
export function androidHaptic(kind: HapticKind, sdk: number, primitives: boolean): Haptics.AndroidHaptics {
  const options = ANDROID_HAPTICS[kind];
  return (options.find(([, since]) => sdk >= since && (since < U || primitives)) ?? options[options.length - 1]!)[0];
}

/**
 * What the phone's motor reports (modules/phaseo-haptics): `effects` and `primitives` are null when Android can't
 * tell (before Android 11, or a motor that doesn't say), and then the system's effects are tried as usual.
 */
export type MotorCapabilities = { vibrator: boolean; amplitude: boolean; effects: boolean | null; primitives: boolean | null };

/**
 * How Android plays haptics on a phone: the system's effects, touch pulses when the motor says it can't play them,
 * or nothing without a motor. Without the module (an older build), the system's effects.
 */
export function androidRoute(motor: MotorCapabilities | null): "system" | "pulse" | "none" {
  if (!motor) return "system";
  if (!motor.vibrator) return "none";
  return motor.effects === false ? "pulse" : "system";
}

type PhaseoHapticsModule = { capabilities(): MotorCapabilities; pulse(timings: number[], amplitudes: number[]): Promise<void> };
/** The app's own module; Android only, so null elsewhere (and in builds made before it). */
const native = requireOptionalNativeModule<PhaseoHapticsModule>("PhaseoHaptics");
let motorCache: MotorCapabilities | null | undefined;

/** The motor's capabilities, asked once. */
export function motorCapabilities(): MotorCapabilities | null {
  if (motorCache === undefined) {
    try {
      motorCache = native?.capabilities() ?? null;
    } catch {
      motorCache = null;
    }
  }
  return motorCache;
}

/** No two haptics closer than this (ms): faster than any one gesture needs, slow enough that bursts stay ticks. */
export const MIN_GAP_MS = 35;

/** Whether a haptic at `now` plays, given when the last one did (null if none has). */
export function shouldPlay(last: number | null, now: number) {
  return last == null || now - last >= MIN_GAP_MS;
}

const STORAGE_KEY = "phaseo.haptics";

function readEnabled() {
  try {
    return kv.getItemSync(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

/** This device's haptics setting (Appearance → Haptic feedback). On unless turned off. */
export const hapticsStore = createStore<{ enabled: boolean }>({ enabled: readEnabled() });

export function setHapticsEnabled(enabled: boolean) {
  hapticsStore.set({ enabled });
  void kv.setItem(STORAGE_KEY, enabled ? "on" : "off").catch(() => undefined);
  // Turning them on plays one, so it's clear what the setting does.
  if (enabled) haptic("toggleOn");
}

/**
 * Plays a kind's effect on a platform (`os`, Android's API level and its motor), with no setting or gap. Never
 * throws.
 */
export function play(kind: HapticKind, os: string, version: number, motor: MotorCapabilities | null) {
  if (os === "android") {
    const route = androidRoute(motor);
    if (route === "pulse" && native) {
      const pulse = ANDROID_PULSES[kind];
      void native.pulse([...pulse.timings], [...pulse.amplitudes]).catch(() => undefined);
    } else if (route !== "none") {
      void Haptics.performAndroidHapticsAsync(androidHaptic(kind, version, motor?.primitives !== false)).catch(() => undefined);
    }
    return;
  }
  if (os !== "ios") return;
  const effect = IOS_HAPTICS[kind];
  const played = effect.kind === "selection" ? Haptics.selectionAsync()
    : effect.kind === "impact" ? Haptics.impactAsync(effect.style)
    : Haptics.notificationAsync(effect.type);
  void played.catch(() => undefined);
}

const playHere = (kind: HapticKind) =>
  play(kind, Platform.OS, Number(Platform.Version) || 0, Platform.OS === "android" ? motorCapabilities() : null);

let lastPlayed: number | null = null;

/** Plays the haptic for a moment, unless haptics are off here or one has just played. Never throws. */
export function haptic(kind: HapticKind) {
  if (!hapticsStore.get().enabled) return;
  const now = Date.now();
  if (!shouldPlay(lastPlayed, now)) return;
  lastPlayed = now;
  playHere(kind);
}

/** Streaming ticks come at most this often (ms): a light patter while text arrives, not a buzz. */
export const STREAM_TICK_MS = 120;
let lastStreamed: number | null = null;

/**
 * A light tick as an answer's text streams in on screen, as popular chat apps do. Ticks never hold up the other
 * haptics (an answer's success plays even straight after one), and the haptics setting turns them off with the rest.
 * Never throws.
 */
export function streamTick() {
  if (!hapticsStore.get().enabled) return;
  const now = Date.now();
  if (lastStreamed != null && now - lastStreamed < STREAM_TICK_MS) return;
  if (!shouldPlay(lastPlayed, now)) return;
  lastStreamed = now;
  playHere("tick");
}
