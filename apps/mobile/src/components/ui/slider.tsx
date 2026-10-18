import { useRef, useState } from "react";
import { View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import { cn } from "@/lib/cn";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const THUMB = 18;

/** The step nearest to a point on the track, as the website's slider snaps. */
export function sliderValueAt(x: number, width: number, range: { min: number; max: number; step: number }) {
  const ratio = width > 0 ? clamp(x / width, 0, 1) : 0;
  const stepped = Math.round((ratio * (range.max - range.min)) / range.step) * range.step + range.min;
  return Number(clamp(stepped, range.min, range.max).toFixed(4));
}

/**
 * A horizontal slider (the website's Slider in model settings): drag or tap the track. `value` null
 * shows the thumb at `placeholder` in a muted colour, meaning "default". Thin bars are rounded-[2px]
 * and the thumb a small rounded square, keeping to the app's no-pill rule.
 */
export function Slider({ value, placeholder, min, max, step, onChange, onCommit, label, className }: { value: number | null; placeholder?: number; min: number; max: number; step: number; onChange?(value: number): void; onCommit(value: number): void; label: string; className?: string }) {
  const width = useRef(0);
  const start = useRef({ x: 0, pageX: 0 });
  const [dragging, setDragging] = useState<number | null>(null);
  const shown = clamp(dragging ?? value ?? placeholder ?? min, min, max);
  const ratio = max > min ? (shown - min) / (max - min) : 0;
  const idle = value == null && dragging == null;

  // The track is inset by half a thumb on each side so the thumb never overhangs the edges.
  const at = (event: GestureResponderEvent) => sliderValueAt(start.current.x + (event.nativeEvent.pageX - start.current.pageX) - THUMB / 2, width.current - THUMB, { min, max, step });
  const nudge = (direction: 1 | -1) => onCommit(Number(clamp(shown + direction * step, min, max).toFixed(4)));

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min, max, now: shown }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(event) => nudge(event.nativeEvent.actionName === "increment" ? 1 : -1)}
      onLayout={(event: LayoutChangeEvent) => { width.current = event.nativeEvent.layout.width; }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event) => {
        start.current = { x: event.nativeEvent.locationX, pageX: event.nativeEvent.pageX };
        const next = at(event);
        setDragging(next);
        onChange?.(next);
      }}
      onResponderMove={(event) => {
        const next = at(event);
        setDragging(next);
        onChange?.(next);
      }}
      onResponderRelease={(event) => {
        setDragging(null);
        onCommit(at(event));
      }}
      onResponderTerminate={() => setDragging(null)}
      className={cn("h-8 justify-center px-[9px]", className)}
    >
      <View pointerEvents="none" className="h-1.5 overflow-hidden rounded-[2px] bg-muted">
        <View className={cn("h-full", idle ? "bg-muted-foreground/40" : "bg-primary")} style={{ width: `${ratio * 100}%` }} />
      </View>
      <View pointerEvents="none" className="absolute inset-y-0 left-[9px] right-[9px] justify-center">
        <View className={cn("absolute h-[18px] w-[18px] rounded-[4px] border-2 bg-background", idle ? "border-muted-foreground/60" : "border-primary")} style={{ left: `${ratio * 100}%`, marginLeft: -THUMB / 2 }} />
      </View>
    </View>
  );
}
