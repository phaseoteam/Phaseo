import { useMemo, useState } from "react";
import { type GestureResponderEvent, View } from "react-native";
import Svg, { G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { Text, useToneColor } from "@/components/ui";
import { cn } from "@/lib/cn";

/** Simple daily bars (usage, tokens). Values are already aggregated by the API. */
export function BarChart({ values, labels, height = 96, className }: { values: number[]; labels?: [string, string]; height?: number; className?: string }) {
  const max = Math.max(1, ...values);
  return (
    <View className={cn("px-4", className)}>
      <View className="flex-row items-end gap-[2px]" style={{ height }}>
        {values.map((value, index) => (
          <View key={index} className={cn("flex-1 rounded-t-[2px]", value > 0 ? "bg-chart-3" : "bg-muted")} style={{ height: Math.max(2, (value / max) * height) }} />
        ))}
      </View>
      {labels ? (
        <View className="mt-1.5 flex-row justify-between">
          <Text variant="caption">{labels[0]}</Text>
          <Text variant="caption">{labels[1]}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Horizontal share bars for breakdowns (spend by model). */
export function ShareBar({ fraction }: { fraction: number }) {
  return (
    <View className="mt-1.5 h-1.5 overflow-hidden rounded-[2px] bg-muted">
      <View className="h-full rounded-[2px] bg-chart-3" style={{ width: `${Math.max(2, Math.min(100, fraction * 100))}%` }} />
    </View>
  );
}

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

function useWidth() {
  const [width, setWidth] = useState(0);
  return { width, onLayout: (event: { nativeEvent: { layout: { width: number } } }) => setWidth(Math.round(event.nativeEvent.layout.width)) };
}

export type LineSeries = { key: string; colour: string; points: { x: number; y: number | null }[]; dash?: string; label?: string };

/**
 * Lines over time (prices, latency, uptime). Gaps (null) break the line; `step` holds each value until
 * the next point, for prices that change at an instant. Press and drag to read values at a point.
 */
export function LineChart({ series, height = 160, yFormat = String, xFormat, yMax, yMin = 0, step = false, showYAxis = true, xTicks = 3, onInspect, className }: {
  series: LineSeries[];
  height?: number;
  yFormat?: (value: number) => string;
  xFormat?: (x: number) => string;
  yMax?: number;
  yMin?: number;
  step?: boolean;
  showYAxis?: boolean;
  xTicks?: number;
  /** Called with the x nearest the finger (or null when released). */
  onInspect?: (x: number | null) => void;
  className?: string;
}) {
  const { width, onLayout } = useWidth();
  const grid = useToneColor("border");
  const muted = useToneColor("muted");
  const [active, setActive] = useState<number | null>(null);
  const xs = useMemo(() => [...new Set(series.flatMap((entry) => entry.points.map((point) => point.x)))].sort((a, b) => a - b), [series]);
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

  const inspect = (event: GestureResponderEvent) => {
    if (!xs.length) return;
    const fingerX = event.nativeEvent.locationX;
    const nearest = xs.reduce((best, x) => (Math.abs(scaleX(x) - fingerX) < Math.abs(scaleX(best) - fingerX) ? x : best), xs[0]!);
    setActive(nearest);
    onInspect?.(nearest);
  };
  const release = () => { setActive(null); onInspect?.(null); };
  const tickCount = Math.min(xTicks, xs.length);
  const tickXs: number[] = Array.from({ length: tickCount }, (_, index) => xMin + ((xMax - xMin) * index) / Math.max(1, tickCount - 1));

  return (
    <View
      className={className}
      onLayout={onLayout}
      onStartShouldSetResponder={() => Boolean(onInspect)}
      onMoveShouldSetResponder={() => Boolean(onInspect)}
      onResponderGrant={inspect}
      onResponderMove={inspect}
      onResponderRelease={release}
      onResponderTerminate={release}
      style={{ height }}
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
          {active != null ? <Line x1={scaleX(active)} x2={scaleX(active)} y1={8} y2={8 + plotHeight} stroke={muted} strokeWidth={1} strokeDasharray="3 3" /> : null}
          {paths.map(({ entry, d }) => (d ? <Path key={entry.key} d={d} stroke={entry.colour} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={entry.dash} /> : null))}
        </Svg>
      ) : null}
    </View>
  );
}

export type BarStack = { key: string; segments: { value: number; colour: string }[]; projected?: number };

/**
 * Stacked daily bars (activity). Segments are separated by a 2 px gap; a projected remainder for today
 * is drawn as a faint cap. Press and drag to read a day.
 */
export function StackedBarChart({ bars, height = 220, yFormat = String, xLabel, labelEvery = 6, onInspect, className }: {
  bars: BarStack[];
  height?: number;
  yFormat?: (value: number) => string;
  xLabel?: (index: number) => string;
  labelEvery?: number;
  onInspect?: (index: number | null) => void;
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
  const slot = plotWidth / Math.max(1, bars.length);
  const barWidth = Math.max(2, Math.min(18, slot * 0.6));
  const scaleY = (value: number) => (value / top) * plotHeight;

  const inspect = (event: GestureResponderEvent) => {
    const index = Math.max(0, Math.min(bars.length - 1, Math.floor((event.nativeEvent.locationX - left) / slot)));
    setActive(index);
    onInspect?.(index);
  };
  const release = () => { setActive(null); onInspect?.(null); };

  return (
    <View
      className={className}
      onLayout={onLayout}
      onStartShouldSetResponder={() => Boolean(onInspect)}
      onMoveShouldSetResponder={() => Boolean(onInspect)}
      onResponderGrant={inspect}
      onResponderMove={inspect}
      onResponderRelease={release}
      onResponderTerminate={release}
      style={{ height }}
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          {ticks.map((tick) => (
            <Line key={`g${tick}`} x1={left} x2={left + plotWidth} y1={8 + plotHeight - scaleY(tick)} y2={8 + plotHeight - scaleY(tick)} stroke={grid} strokeWidth={1} />
          ))}
          {ticks.map((tick) => (
            <SvgText key={`y${tick}`} x={left - 6} y={8 + plotHeight - scaleY(tick) + 3.5} fontSize={10} fill={muted} textAnchor="end">{yFormat(tick)}</SvgText>
          ))}
          {bars.map((bar, index) => {
            const x = left + slot * index + (slot - barWidth) / 2;
            let y = 8 + plotHeight;
            const parts = bar.segments.filter((segment) => segment.value > 0);
            const rects = parts.map((segment, part) => {
              const h = Math.max(1, scaleY(segment.value) - (part > 0 ? 2 : 0));
              y -= h + (part > 0 ? 2 : 0);
              return <Rect key={part} x={x} y={y} width={barWidth} height={h} fill={segment.colour} rx={part === parts.length - 1 && !bar.projected ? 2 : 0} opacity={active == null || active === index ? 1 : 0.55} />;
            });
            const projected = bar.projected && bar.projected > 0 ? (() => {
              const h = scaleY(bar.projected!);
              y -= h + 2;
              return <Rect key="projected" x={x} y={y} width={barWidth} height={h} fill={muted} opacity={0.3} rx={2} />;
            })() : null;
            return <G key={bar.key}>{rects}{projected}</G>;
          })}
          {xLabel ? bars.map((bar, index) => (index % labelEvery === labelEvery - 1 || index === bars.length - 1) && index !== bars.length - 2 ? (
            <SvgText key={`x${bar.key}`} x={left + slot * index + slot / 2} y={height - 4} fontSize={10} fill={muted} textAnchor={index === bars.length - 1 ? "end" : "middle"}>{xLabel(index)}</SvgText>
          ) : null) : null}
        </Svg>
      ) : null}
    </View>
  );
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
