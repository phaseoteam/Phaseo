import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { kv } from "@/lib/storage";
import { createStore } from "@/lib/store";

/**
 * Haptics by what happened, so the same moment feels the same everywhere. Call `haptic(kind)`; don't use
 * expo-haptics directly (src/lib/haptics.test.ts checks).
 *
 * Android plays the system's own effects (`View.performHapticFeedback`), the ones its keyboard, switches and launcher
 * use: tuned for each phone's motor, and off when the phone's touch vibration is off. Not expo-haptics' impact,
 * selection and notification calls, which on Android drive the vibration motor with fixed patterns, buzz rather than
 * tick, and ignore that setting. Effects Android added later (13 and 14) fall back to older ones on older phones.
 * iOS plays its feedback generators.
 *
 * Haptics mark moments, not every tap: a choice made, a switch flipped, a long press caught, a message sent, an
 * outcome (done, copied, saved, failed), and a few physical ones in the version art. Plain buttons and navigation stay
 * quiet, as they do in the system's own apps. Two haptics never play within MIN_GAP_MS of each other, so a burst of
 * events (a scrub across a chart, logos colliding, a toast after a copy) can't turn into a buzz.
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

/** The Android effect for a kind on a given Android version (API level). */
export function androidHaptic(kind: HapticKind, sdk: number): Haptics.AndroidHaptics {
  const options = ANDROID_HAPTICS[kind];
  return (options.find(([, since]) => sdk >= since) ?? options[options.length - 1]!)[0];
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

/** Plays a kind's effect on a platform (`os` and Android's API level), with no setting or gap. Never throws. */
export function play(kind: HapticKind, os: string, version: number) {
  if (os === "android") {
    void Haptics.performAndroidHapticsAsync(androidHaptic(kind, version)).catch(() => undefined);
    return;
  }
  if (os !== "ios") return;
  const effect = IOS_HAPTICS[kind];
  const played = effect.kind === "selection" ? Haptics.selectionAsync()
    : effect.kind === "impact" ? Haptics.impactAsync(effect.style)
    : Haptics.notificationAsync(effect.type);
  void played.catch(() => undefined);
}

let lastPlayed: number | null = null;

/** Plays the haptic for a moment, unless haptics are off here or one has just played. Never throws. */
export function haptic(kind: HapticKind) {
  if (!hapticsStore.get().enabled) return;
  const now = Date.now();
  if (!shouldPlay(lastPlayed, now)) return;
  lastPlayed = now;
  play(kind, Platform.OS, Number(Platform.Version) || 0);
}
