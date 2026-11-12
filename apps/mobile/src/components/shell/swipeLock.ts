import { createContext } from "react";
import type { SharedValue } from "react-native-reanimated";

/**
 * A touch that starts on a sideways row keeps the phone's sidebar drawer from taking it, in either direction. The rows
 * and the drawer share one value on the UI thread: when the lock was taken (ms), or 0. A row takes it when a finger
 * lands and frees it when the last finger lifts; the drawer's pan fails itself on its first move while it's held, and
 * stays failed for the rest of that touch. Gesture-handler delivers each touch to every handler's touch callbacks
 * before any handler can activate on it, so the lock is in place before the drawer's pan could take the drag, with no
 * trip through JS. A row that never frees it (unmounted mid-touch) can block the drawer for SWIPE_LOCK_TIMEOUT at most.
 *
 * Momentum after a fling doesn't hold it: a finger that lands on the coasting row takes the lock itself, and one that
 * lands anywhere else should open the sidebar.
 */
export const SWIPE_LOCK_TIMEOUT = 5000;

/** Null where there's no drawer to lock (split layouts, sheets in their own window). */
export const SwipeLockContext = createContext<SharedValue<number> | null>(null);

type Lock = { value: number };

export function acquireSwipeLock(lock: Lock, now: number) {
  "worklet";
  lock.value = now;
}

export function releaseSwipeLock(lock: Lock) {
  "worklet";
  lock.value = 0;
}

export function swipeLocked(lock: Lock, now: number) {
  "worklet";
  return lock.value > 0 && now - lock.value < SWIPE_LOCK_TIMEOUT;
}
