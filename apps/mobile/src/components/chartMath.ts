/** Geometry shared by the charts (no React Native imports, so it can be tested). */

/** Three to five round steps from zero to just above the maximum. */
export function niceTicks(max: number, count = 4) {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= raw) ?? raw;
  const ticks: number[] = [];
  for (let value = 0; value <= max + step * 0.001; value += step) ticks.push(Number(value.toPrecision(12)));
  if (ticks.at(-1)! < max) ticks.push(Number((ticks.at(-1)! + step).toPrecision(12)));
  return ticks;
}

/** The index of the position nearest `x` (positions in ascending order), or -1 when there are none. */
export function nearestIndex(positions: readonly number[], x: number): number {
  if (!positions.length) return -1;
  let low = 0;
  let high = positions.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (positions[middle]! < x) low = middle + 1;
    else high = middle;
  }
  // `low` is the first position at or after x; the one before it may be nearer.
  if (low > 0 && Math.abs(positions[low - 1]! - x) <= Math.abs(positions[low]! - x)) return low - 1;
  return low;
}

/** The bar under `x` when `count` bars sit in equal slots from `left`; a finger past either end picks the end bar. */
export function slotIndex(x: number, left: number, slot: number, count: number): number {
  if (count <= 0 || !(slot > 0)) return -1;
  return Math.max(0, Math.min(count - 1, Math.floor((x - left) / slot)));
}

/** Bars in equal slots: the slot width, each bar's width and its left edge and centre. */
export function barLayout(count: number, left: number, plotWidth: number, maxBar = 18) {
  const slot = plotWidth / Math.max(1, count);
  const barWidth = Math.max(2, Math.min(maxBar, slot * 0.6));
  const x = (index: number) => left + slot * index + (slot - barWidth) / 2;
  return { slot, barWidth, x, centre: (index: number) => x(index) + barWidth / 2 };
}

/** A worklet too: placeTooltip calls it on the UI thread, where only worklets can be called. */
function clamp(value: number, min: number, max: number) {
  "worklet";
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export type TooltipPlacement = { left: number; top: number };

/**
 * Where the readout bubble goes, inside the chart: centred over the selected point, above the finger. When there
 * isn't room above, it sits beside the finger on the side with more room, level with it, so the finger never
 * covers it. Runs on the UI thread too (it positions the bubble as the finger moves).
 */
export function placeTooltip(args: { anchorX: number; fingerY: number; bubbleWidth: number; bubbleHeight: number; width: number; height: number; finger?: number; gap?: number }): TooltipPlacement {
  "worklet";
  const finger = args.finger ?? 24;
  const gap = args.gap ?? 8;
  const above = args.fingerY - finger - gap - args.bubbleHeight;
  if (above >= 0) return { left: clamp(args.anchorX - args.bubbleWidth / 2, 0, args.width - args.bubbleWidth), top: above };
  const top = clamp(args.fingerY - args.bubbleHeight / 2, 0, args.height - args.bubbleHeight);
  const right = args.anchorX + finger + gap;
  const leftSide = args.anchorX - finger - gap - args.bubbleWidth;
  const roomRight = args.width - right - args.bubbleWidth;
  const left = roomRight >= 0 || roomRight >= leftSide ? right : leftSide;
  return { left: clamp(left, 0, args.width - args.bubbleWidth), top };
}

/** The selected index after an accessibility increment or decrement, starting from the latest point. */
export function stepIndex(current: number | null, count: number, direction: 1 | -1): number | null {
  if (count <= 0) return null;
  if (current == null) return direction === 1 ? 0 : count - 1;
  return Math.max(0, Math.min(count - 1, current + direction));
}

/**
 * An SVG path through a series' points (already in screen coordinates), broken at missing values.
 * A point with no neighbour on either side draws no line, so it comes back in `dots` to be drawn as a dot:
 * a series with one day of data, or one busy hour between quiet ones.
 */
export function linePath(points: readonly { x: number; y: number | null }[], step = false) {
  let d = "";
  let previous: { x: number; y: number } | null = null;
  let run = 0;
  const dots: { x: number; y: number }[] = [];
  for (const point of points) {
    if (point.y == null || !Number.isFinite(point.y)) {
      if (run === 1 && previous) dots.push(previous);
      previous = null;
      run = 0;
      continue;
    }
    const { x, y } = point;
    if (!previous) d += `M${x.toFixed(1)},${y.toFixed(1)}`;
    else d += step ? `H${x.toFixed(1)}V${y.toFixed(1)}` : `L${x.toFixed(1)},${y.toFixed(1)}`;
    previous = { x, y };
    run += 1;
  }
  if (run === 1 && previous) dots.push(previous);
  return { d, dots };
}
