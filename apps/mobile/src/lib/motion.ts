import { Easing, useSharedValue } from "react-native-reanimated";

/**
 * Shared motion values, so the same kind of movement feels the same everywhere.
 * Curves: entering and leaving ease out; moving on screen eases in and out. Never ease-in on UI: it starts slow,
 * at the moment the eye is watching.
 */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
export const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1);

/** A drawer settling where it's going, with no overshoot, carrying a release's velocity when there is one. */
export const SHEET_SPRING = { duration: 300, dampingRatio: 1 } as const;
/** A drawer or toast let go short of dismissing: back home, with a little give. */
export const SNAP_BACK_SPRING = { duration: 300, dampingRatio: 0.8 } as const;

/**
 * Where a flick would come to rest if it kept decelerating (px from where it was let go), from its velocity in px/s.
 * Dismissals check this rather than distance alone, so a quick short flick is enough.
 */
export function project(velocity: number, decelerationRate = 0.998) {
  "worklet";
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** A movement this recent still counts as the finger's speed when it lets go (ms). */
const RELEASE_WINDOW_MS = 100;

/**
 * The speed a drag is let go at. On Android the pan's release event can report a velocity of 0 even mid-flick, so
 * `track` remembers each update's velocity and `release` falls back to it, unless the finger had stopped (no update
 * in the last RELEASE_WINDOW_MS), when 0 is right: a drag that stops before letting go isn't a flick.
 */
export function useReleaseVelocity() {
  const last = useSharedValue(0);
  const movedAt = useSharedValue(0);
  const track = (velocity: number) => {
    "worklet";
    last.set(velocity);
    movedAt.set(Date.now());
  };
  const release = (velocity: number) => {
    "worklet";
    if (velocity !== 0) return velocity;
    return Date.now() - movedAt.get() <= RELEASE_WINDOW_MS ? last.get() : 0;
  };
  return { track, release };
}

/** How far something follows a finger dragged `overshoot` px past an edge: less the further it goes. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  "worklet";
  if (dimension <= 0) return 0;
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
