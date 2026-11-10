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
 * The speed (px/s) a drag is let go at. On Android the pan's release velocity is unreliable (0, or far too low,
 * mid-flick), so `track` measures the speed itself from each update's position and time, and `release` takes whichever
 * of the two is faster, as long as the finger was still moving (an update within RELEASE_WINDOW_MS). A finger that
 * stopped before letting go gives 0: that drag isn't a flick. Call `start` when the drag activates.
 */
export function useReleaseVelocity() {
  const measured = useSharedValue(0);
  const lastPosition = useSharedValue(0);
  const movedAt = useSharedValue(0);
  const start = (position: number) => {
    "worklet";
    measured.set(0);
    lastPosition.set(position);
    movedAt.set(Date.now());
  };
  const track = (position: number) => {
    "worklet";
    const now = Date.now();
    const elapsed = now - movedAt.get();
    if (elapsed <= 0) return;
    const speed = ((position - lastPosition.get()) / elapsed) * 1000;
    // Mostly the latest step, a little of the ones before, so one uneven event doesn't decide it.
    measured.set(measured.get() * 0.3 + speed * 0.7);
    lastPosition.set(position);
    movedAt.set(now);
  };
  const release = (reported: number) => {
    "worklet";
    if (Date.now() - movedAt.get() > RELEASE_WINDOW_MS) return 0;
    const own = measured.get();
    return Math.abs(reported) > Math.abs(own) && Math.sign(reported) === Math.sign(own) ? reported : own;
  };
  return { start, track, release };
}

/** How far something follows a finger dragged `overshoot` px past an edge: less the further it goes. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  "worklet";
  if (dimension <= 0) return 0;
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
