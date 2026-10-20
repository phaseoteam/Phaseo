import * as Haptics from "expo-haptics";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { type AccessibilityActionEvent, type LayoutChangeEvent, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, { FadeIn, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { Text, useToneColor } from "@/components/ui";
import { cn } from "@/lib/cn";
import { barLayout, nearestIndex, niceTicks, placeTooltip, slotIndex, stepIndex } from "./chartMath";

export { niceTicks } from "./chartMath";

/** How long a finger has to rest on a chart before dragging reads it; a quicker swipe scrolls the page. */
export const INSPECT_HOLD_MS = 250;
/** An accessibility step's readout stays this long. */
const A11Y_READOUT_MS = 5_000;

function useWidth() {
  const [width, setWidth] = useState(0);
  return { width, onLayout: (event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width)) };
}

type SurfaceProps = {
  height: number;
  width: number;
  onLayout(event: LayoutChangeEvent): void;
  count: number;
  /** The x (in the chart's own coordinates) a point or bar is drawn at. */
  anchor(index: number): number;
  /** The index under a finger at x. */
  hitTest(x: number): number;
  active: number | null;
  onActive(index: number | null): void;
  /** What the chart shows, for screen readers. */
  label: string;
  /** One point in words: the screen reader's value as it steps through the chart. */
  describe(index: number): string;
  /** The bubble's content for a point; without it the chart isn't interactive. */
  tooltip?: (index: number) => ReactNode;
  className?: string;
  children: ReactNode;
};

/**
 * Press and hold, then drag: the one interaction every chart shares. The pan only starts after INSPECT_HOLD_MS
 * without moving, so a swipe that starts on a chart still scrolls the page; once it starts, the page stops
 * scrolling until the finger lifts. A bubble with the point's values follows the finger (kept inside the chart),
 * the chart highlights the point, and each new point gives a light haptic tick. Screen readers get the chart as
 * an adjustable element: swiping up or down steps through the points and reads each one.
 */
function ChartSurface({ height, width, onLayout, count, anchor, hitTest, active, onActive, label, describe, tooltip, className, children }: SurfaceProps) {
  // The gesture's callbacks are made once; they read the chart's current geometry from here.
  const latest = useRef({ anchor, hitTest, onActive, count, active });
  useLayoutEffect(() => { latest.current = { anchor, hitTest, onActive, count, active }; });
  const selected = useRef<number | null>(null);
  const a11yTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fingerY = useSharedValue(height / 2);
  const anchorX = useSharedValue(0);
  const chartWidth = useSharedValue(width);
  const bubbleSize = useSharedValue({ width: 0, height: 0 });
  const interactive = Boolean(tooltip) && count > 0;

  useEffect(() => { chartWidth.set(width); }, [chartWidth, width]);
  useEffect(() => () => clearTimeout(a11yTimer.current), []);

  const gesture = usePanGesture(useMemo(() => {
    const move = (x: number, y: number) => {
      const index = latest.current.hitTest(x);
      if (index < 0) return;
      fingerY.set(y);
      anchorX.set(latest.current.anchor(index));
      if (index === selected.current) return;
      selected.current = index;
      latest.current.onActive(index);
      void Haptics.selectionAsync().catch(() => undefined);
    };
    return {
      activateAfterLongPress: INSPECT_HOLD_MS,
      runOnJS: true,
      onActivate: (event: { x: number; y: number }) => move(event.x, event.y),
      onUpdate: (event: { x: number; y: number }) => move(event.x, event.y),
      onFinalize: () => {
        if (selected.current == null) return;
        selected.current = null;
        latest.current.onActive(null);
      },
    };
  }, [anchorX, fingerY]));

  const bubbleStyle = useAnimatedStyle(() => {
    const size = bubbleSize.get();
    const place = placeTooltip({ anchorX: anchorX.get(), fingerY: fingerY.get(), bubbleWidth: size.width, bubbleHeight: size.height, width: chartWidth.get(), height });
    return { opacity: size.width ? 1 : 0, transform: [{ translateX: place.left }, { translateY: place.top }] };
  });

  const step = (event: AccessibilityActionEvent) => {
    const direction = event.nativeEvent.actionName === "increment" ? 1 : event.nativeEvent.actionName === "decrement" ? -1 : 0;
    if (!direction) return;
    const next = stepIndex(active, count, direction);
    if (next == null) return;
    anchorX.set(anchor(next));
    fingerY.set(height);
    onActive(next);
    clearTimeout(a11yTimer.current);
    a11yTimer.current = setTimeout(() => latest.current.onActive(null), A11Y_READOUT_MS);
  };

  const body = (
    <View
      className={cn("relative", className)}
      style={{ height }}
      onLayout={onLayout}
      accessible
      accessibilityRole={interactive ? "adjustable" : "image"}
      accessibilityLabel={label}
      accessibilityHint={interactive ? "Swipe up or down to read each point. Or press and hold, then drag." : undefined}
      accessibilityValue={interactive && active != null ? { text: describe(active) } : undefined}
      accessibilityActions={interactive ? [{ name: "increment" }, { name: "decrement" }] : undefined}
      onAccessibilityAction={interactive ? step : undefined}
    >
      {children}
      {interactive && active != null && width > 0 ? (
        // Reanimated views take styles only; the themed bubble is a core View inside.
        <Animated.View
          pointerEvents="none"
          entering={FadeIn.duration(90)}
          style={[{ position: "absolute", left: 0, top: 0, maxWidth: Math.max(120, Math.min(260, width - 8)) }, bubbleStyle]}
          onLayout={(event) => bubbleSize.set({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}
        >
          <View className="rounded-md border border-border bg-popover px-2.5 py-2" style={{ elevation: 4, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}>
            {tooltip!(active)}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
  return interactive ? <GestureDetector gesture={gesture}>{body}</GestureDetector> : body;
}

/** A bubble row: a colour mark, a name and a value. */
export function TooltipRow({ colour, label, value, dash }: { colour?: string; label: string; value: string; dash?: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      {!colour ? null : dash ? (
        <Svg width={14} height={6}><Line x1={1} x2={13} y1={3} y2={3} stroke={colour} strokeWidth={2} strokeDasharray={dash} strokeLinecap="round" /></Svg>
      ) : (
        <View className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: colour }} />
      )}
      <Text variant="caption" numberOfLines={1} className="shrink text-foreground">{label}</Text>
      <Text variant="caption" className="ml-auto pl-2 font-semibold text-foreground">{value}</Text>
    </View>
  );
}

/** A bubble's heading: the date or time of the point. */
export function TooltipTitle({ children }: { children: ReactNode }) {
  return <Text variant="caption" className="mb-1 font-semibold text-muted-foreground">{children}</Text>;
}

/** Horizontal share bars for breakdowns (spend by model); the row beside it already shows the values. */
export function ShareBar({ fraction, label }: { fraction: number; label?: string }) {
  const percent = Math.max(0, Math.min(100, fraction * 100));
  return (
    <View
      accessible={Boolean(label)}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(percent) }}
      className="mt-1.5 h-1.5 overflow-hidden rounded-[2px] bg-muted"
    >
      <View className="h-full rounded-[2px] bg-chart-4" style={{ width: `${Math.max(2, percent)}%` }} />
    </View>
  );
}

export type LineSeries = { key: string; colour: string; points: { x: number; y: number | null }[]; dash?: string; label?: string };

/**
 * Lines over time (prices, latency, uptime). Gaps (null) break the line; `step` holds each value until
 * the next point, for prices that change at an instant. Press, hold and drag to read the values at a time.
 */
export function LineChart({ series, height = 160, yFormat = String, xFormat, valueFormat, tooltipTitle, yMax, yMin = 0, step = false, showYAxis = true, xTicks = 3, onInspect, accessibilityLabel, className }: {
  series: LineSeries[];
  height?: number;
  yFormat?: (value: number) => string;
  xFormat?: (x: number) => string;
  /** Values in the bubble (defaults to yFormat). */
  valueFormat?: (value: number) => string;
  /** The bubble's heading (defaults to xFormat). */
  tooltipTitle?: (x: number) => string;
  yMax?: number;
  yMin?: number;
  step?: boolean;
  showYAxis?: boolean;
  xTicks?: number;
  /** Called with the x being read (or null when the finger lifts). */
  onInspect?: (x: number | null) => void;
  accessibilityLabel?: string;
  className?: string;
}) {
  const { width, onLayout } = useWidth();
  const grid = useToneColor("border");
  const muted = useToneColor("muted");
  const background = useToneColor("background");
  const [active, setActive] = useState<number | null>(null);
  const xs = useMemo(() => [...new Set(series.flatMap((entry) => entry.points.map((point) => point.x)))].sort((a, b) => a - b), [series]);
  const valuesAt = useMemo(() => series.map((entry) => new Map(entry.points.map((point) => [point.x, point.y] as const))), [series]);
  const maxValue = Math.max(0, ...series.flatMap((entry) => entry.points.map((point) => point.y ?? 0)));
  const ticks = niceTicks(yMax ?? maxValue);
  const top = ticks.at(-1)! || 1;
  const left = showYAxis ? Math.max(28, ...ticks.map((tick) => yFormat(tick).length * 6.2 + 6)) : 0;
  const bottom = xFormat ? 18 : 4;
  const plotWidth = Math.max(1, width - left - 4);
  const plotHeight = height - bottom - 8;
  const [xMin, xMax] = [xs[0] ?? 0, xs.at(-1) ?? 1];
  const scaleX = (x: number) => left + (xMax === xMin ? plotWidth / 2 : ((x - xMin) / (xMax - xMin)) * plotWidth);
  const scaleY = (y: number) => 8 + plotHeight - ((y - yMin) / (top - yMin || 1)) * plotHeight;
  const positions = xs.map(scaleX);
  const format = valueFormat ?? yFormat;
  const title = tooltipTitle ?? xFormat ?? ((x: number) => String(x));

  const paths = series.map((entry) => {
    let d = "";
    let previous: { x: number; y: number } | null = null;
    for (const point of [...entry.points].sort((a, b) => a.x - b.x)) {
      if (point.y == null || !Number.isFinite(point.y)) { previous = null; continue; }
      const x = scaleX(point.x);
      const y = scaleY(point.y);
      if (!previous) d += `M${x.toFixed(1)},${y.toFixed(1)}`;
      else d += step ? `H${x.toFixed(1)}V${y.toFixed(1)}` : `L${x.toFixed(1)},${y.toFixed(1)}`;
      previous = { x, y };
    }
    return { entry, d };
  });

  /** A series' value at an x; a step line holds its last value until the next change. */
  const valueAt = (seriesIndex: number, x: number): number | null => {
    const exact = valuesAt[seriesIndex]?.get(x);
    if (exact !== undefined || !step) return exact ?? null;
    let found: number | null = null;
    for (const point of series[seriesIndex]!.points) if (point.x <= x && point.y != null) found = point.y;
    return found;
  };
  const readings = (index: number) => {
    const x = xs[index]!;
    return series.map((entry, seriesIndex) => ({ entry, value: valueAt(seriesIndex, x) })).filter((reading) => reading.value != null && Number.isFinite(reading.value));
  };
  const select = (index: number | null) => {
    setActive(index);
    onInspect?.(index == null ? null : xs[index] ?? null);
  };
  const tickCount = Math.min(xTicks, xs.length);
  const tickXs: number[] = Array.from({ length: tickCount }, (_, index) => xMin + ((xMax - xMin) * index) / Math.max(1, tickCount - 1));
  const activeX = active != null ? xs[active] : undefined;

  return (
    <ChartSurface
      className={className}
      height={height}
      width={width}
      onLayout={onLayout}
      count={xs.length}
      anchor={(index) => positions[index] ?? 0}
      hitTest={(x) => nearestIndex(positions, x)}
      active={active}
      onActive={select}
      label={accessibilityLabel ?? `Line chart with ${series.length} ${series.length === 1 ? "line" : "lines"} and ${xs.length} points`}
      describe={(index) => [title(xs[index]!), ...readings(index).map(({ entry, value }) => `${entry.label ?? entry.key} ${format(value!)}`)].join(", ")}
      tooltip={(index) => {
        const rows = readings(index);
        return (
          <>
            <TooltipTitle>{title(xs[index]!)}</TooltipTitle>
            {rows.length ? rows.slice(0, 6).map(({ entry, value }) => <TooltipRow key={entry.key} colour={entry.colour} dash={entry.dash} label={entry.label ?? ""} value={format(value!)} />) : <Text variant="caption">No data at this time</Text>}
            {rows.length > 6 ? <Text variant="caption" className="mt-0.5">{`${rows.length - 6} more below the chart`}</Text> : null}
          </>
        );
      }}
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          {ticks.map((tick) => (
            <Line key={`g${tick}`} x1={left} x2={left + plotWidth} y1={scaleY(tick)} y2={scaleY(tick)} stroke={grid} strokeWidth={1} />
          ))}
          {showYAxis ? ticks.map((tick) => (
            <SvgText key={`y${tick}`} x={left - 6} y={scaleY(tick) + 3.5} fontSize={10} fill={muted} textAnchor="end">{yFormat(tick)}</SvgText>
          )) : null}
          {xFormat ? tickXs.map((x, index) => (
            <SvgText key={`x${index}`} x={scaleX(x)} y={height - 4} fontSize={10} fill={muted} textAnchor={index === 0 ? "start" : index === tickXs.length - 1 ? "end" : "middle"}>{xFormat(x)}</SvgText>
          )) : null}
          {activeX != null ? <Line x1={scaleX(activeX)} x2={scaleX(activeX)} y1={8} y2={8 + plotHeight} stroke={muted} strokeWidth={1} strokeDasharray="3 3" /> : null}
          {paths.map(({ entry, d }) => (d ? <Path key={entry.key} d={d} stroke={entry.colour} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={entry.dash} /> : null))}
          {activeX != null ? series.map((entry, seriesIndex) => {
            const value = valueAt(seriesIndex, activeX);
            return value == null ? null : <Circle key={`dot${entry.key}`} cx={scaleX(activeX)} cy={scaleY(value)} r={4} fill={entry.colour} stroke={background} strokeWidth={2} />;
          }) : null}
        </Svg>
      ) : null}
    </ChartSurface>
  );
}

export type BarStack = { key: string; segments: { value: number; colour: string }[]; projected?: number };

/**
 * Stacked bars over time (activity, spend). Segments are separated by a 2 px gap; a projected remainder for today
 * is drawn as a faint cap. Press, hold and drag to read a bar; the others dim while one is read.
 */
export function StackedBarChart({ bars, height = 220, yFormat = String, xLabel, labelEvery = 6, tooltip, describe, onInspect, accessibilityLabel, className }: {
  bars: BarStack[];
  height?: number;
  yFormat?: (value: number) => string;
  xLabel?: (index: number) => string;
  labelEvery?: number;
  /** The bubble for a bar; without it the chart can't be read by touch. */
  tooltip?: (index: number) => ReactNode;
  /** A bar in words, for screen readers. */
  describe?: (index: number) => string;
  onInspect?: (index: number | null) => void;
  accessibilityLabel?: string;
  className?: string;
}) {
  const { width, onLayout } = useWidth();
  const grid = useToneColor("border");
  const muted = useToneColor("muted");
  const [active, setActive] = useState<number | null>(null);
  const totals = bars.map((bar) => bar.segments.reduce((sum, segment) => sum + segment.value, 0) + (bar.projected ?? 0));
  const ticks = niceTicks(Math.max(0, ...totals));
  const top = ticks.at(-1)! || 1;
  const left = Math.max(28, ...ticks.map((tick) => yFormat(tick).length * 6.2 + 6));
  const bottom = xLabel ? 18 : 4;
  const plotWidth = Math.max(1, width - left - 2);
  const plotHeight = height - bottom - 8;
  const layout = barLayout(bars.length, left, plotWidth);
  const scaleY = (value: number) => (value / top) * plotHeight;
  const select = (index: number | null) => {
    setActive(index);
    onInspect?.(index);
  };

  return (
    <ChartSurface
      className={className}
      height={height}
      width={width}
      onLayout={onLayout}
      count={bars.length}
      anchor={layout.centre}
      hitTest={(x) => slotIndex(x, left, layout.slot, bars.length)}
      active={active}
      onActive={select}
      label={accessibilityLabel ?? `Bar chart with ${bars.length} bars`}
      describe={describe ?? ((index) => `${xLabel?.(index) ?? `Bar ${index + 1}`}: ${yFormat(totals[index] ?? 0)}`)}
      tooltip={tooltip}
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          {ticks.map((tick) => (
            <Line key={`g${tick}`} x1={left} x2={left + plotWidth} y1={8 + plotHeight - scaleY(tick)} y2={8 + plotHeight - scaleY(tick)} stroke={grid} strokeWidth={1} />
          ))}
          {ticks.map((tick) => (
            <SvgText key={`y${tick}`} x={left - 6} y={8 + plotHeight - scaleY(tick) + 3.5} fontSize={10} fill={muted} textAnchor="end">{yFormat(tick)}</SvgText>
          ))}
          {active != null ? <Rect x={left + layout.slot * active} y={8} width={layout.slot} height={plotHeight} fill={muted} opacity={0.12} rx={2} /> : null}
          {bars.map((bar, index) => {
            const x = layout.x(index);
            let y = 8 + plotHeight;
            const parts = bar.segments.filter((segment) => segment.value > 0);
            const dim = active != null && active !== index ? 0.45 : 1;
            const rects = parts.map((segment, part) => {
              const h = Math.max(1, scaleY(segment.value) - (part > 0 ? 2 : 0));
              y -= h + (part > 0 ? 2 : 0);
              return <Rect key={part} x={x} y={y} width={layout.barWidth} height={h} fill={segment.colour} rx={part === parts.length - 1 && !bar.projected ? 2 : 0} opacity={dim} />;
            });
            const projected = bar.projected && bar.projected > 0 ? (() => {
              const h = scaleY(bar.projected!);
              y -= h + 2;
              return <Rect key="projected" x={x} y={y} width={layout.barWidth} height={h} fill={muted} opacity={0.3 * dim} rx={2} />;
            })() : null;
            return <G key={bar.key}>{rects}{projected}</G>;
          })}
          {xLabel ? bars.map((bar, index) => (index % labelEvery === labelEvery - 1 || index === bars.length - 1) && index !== bars.length - 2 ? (
            <SvgText key={`x${bar.key}`} x={left + layout.slot * index + layout.slot / 2} y={height - 4} fontSize={10} fill={muted} textAnchor={index === bars.length - 1 ? "end" : "middle"}>{xLabel(index)}</SvgText>
          ) : null) : null}
        </Svg>
      ) : null}
    </ChartSurface>
  );
}

/** Single-colour bars (spend per day or hour) with a y-axis: a StackedBarChart with one segment per bar. */
export function BarChart({ values, colour, ...props }: Omit<Parameters<typeof StackedBarChart>[0], "bars"> & { values: { key: string; value: number }[]; colour: string }) {
  const bars = useMemo(() => values.map((entry) => ({ key: entry.key, segments: [{ value: entry.value, colour }] })), [values, colour]);
  return <StackedBarChart {...props} bars={bars} />;
}

/** A legend row: a short line (or dot) in the series colour, then the name in text ink. */
export function LegendItem({ colour, label, value, dash, dot, muted }: { colour: string; label: string; value?: string | null; dash?: string; dot?: boolean; muted?: boolean }) {
  return (
    <View className={cn("flex-row items-center gap-1.5", muted && "opacity-50")}>
      {dot ? (
        <View className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: colour }} />
      ) : (
        <Svg width={dash ? 28 : 20} height={8}><Line x1={1} x2={dash ? 27 : 19} y1={4} y2={4} stroke={colour} strokeWidth={2} strokeDasharray={dash} strokeLinecap="round" /></Svg>
      )}
      {label ? <Text variant="caption" className="text-muted-foreground">{label}</Text> : null}
      {value ? <Text variant="caption" className="font-semibold text-foreground">{value}</Text> : null}
    </View>
  );
}
