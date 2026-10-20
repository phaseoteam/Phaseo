import { useId, useRef, useState } from "react";
import { View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { Text, TextField } from "@/components/ui";
import { cn } from "@/lib/cn";
import { hexToHsv, hsvToHex, parseHex, type Hsv } from "@/lib/theme/colour";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const THUMB = 18;
/** The colour wheel's hues in order, for the hue bar. */
const HUES = ["#ff0000", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#ff00ff", "#ff0000"];

/** A drag area that reports where the finger is as 0–1 on each axis (the slider's responder pattern). */
function useDrag(onMove: (x: number, y: number) => void) {
  const size = useRef({ width: 0, height: 0 });
  const start = useRef({ x: 0, y: 0, pageX: 0, pageY: 0 });
  const at = (event: GestureResponderEvent) => {
    const x = start.current.x + (event.nativeEvent.pageX - start.current.pageX);
    const y = start.current.y + (event.nativeEvent.pageY - start.current.pageY);
    onMove(size.current.width > 0 ? clamp(x / size.current.width, 0, 1) : 0, size.current.height > 0 ? clamp(y / size.current.height, 0, 1) : 0);
  };
  return {
    onLayout: (event: LayoutChangeEvent) => { size.current = { width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height }; },
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (event: GestureResponderEvent) => {
      start.current = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY, pageX: event.nativeEvent.pageX, pageY: event.nativeEvent.pageY };
      at(event);
    },
    onResponderMove: at,
  };
}

/** A square thumb with a white edge and a dark outline, visible on any colour (no circles). */
function Thumb({ colour, left, top }: { colour: string; left: number | `${number}%`; top: number | `${number}%` }) {
  return (
    <View pointerEvents="none" className="absolute rounded-[5px] border border-black/40" style={{ left, top, width: THUMB, height: THUMB, marginLeft: -THUMB / 2, marginTop: -THUMB / 2 }}>
      <View className="flex-1 rounded-[4px] border-2 border-white" style={{ backgroundColor: colour }} />
    </View>
  );
}

/**
 * Hue, saturation and brightness, like the website's colour picker: drag the square for saturation
 * (across) and brightness (down), the bar for hue, or type a hex code. HSV is the state, so the hue
 * survives dragging through greys.
 */
export function ColourPicker({ value, onChange, onValidChange }: { value: string; onChange(hex: string): void; onValidChange?(valid: boolean): void }) {
  const ids = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [draft, setDraft] = useState(value);
  const hex = hsvToHex(hsv);
  const hueColour = hsvToHex({ h: hsv.h, s: 1, v: 1 });
  const invalid = parseHex(draft) == null;

  const update = (next: Hsv) => {
    setHsv(next);
    const nextHex = hsvToHex(next);
    setDraft(nextHex);
    onValidChange?.(true);
    onChange(nextHex);
  };
  const plane = useDrag((x, y) => update({ ...hsv, s: x, v: 1 - y }));
  const hue = useDrag((x) => update({ ...hsv, h: x * 359.9 }));

  const typed = (text: string) => {
    setDraft(text);
    const parsed = parseHex(text);
    onValidChange?.(parsed != null);
    if (!parsed) return;
    const next = hexToHsv(parsed);
    // A grey has no hue of its own; keep the one already chosen.
    setHsv(next.s === 0 ? { ...next, h: hsv.h } : next);
    onChange(parsed);
  };

  return (
    <View className="gap-3">
      <View>
        <View className="flex-row items-center gap-2">
          <View className="h-11 w-11 rounded-md border border-border" style={{ backgroundColor: invalid ? hex : parseHex(draft) ?? hex }} />
          <TextField
            value={draft}
            onChangeText={typed}
            onBlur={() => { setDraft(hex); onValidChange?.(true); }}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            maxLength={7}
            accessibilityLabel="Hex colour"
            placeholder="#0069a8"
            returnKeyType="done"
            className={cn("flex-1 font-mono", invalid && "border-destructive")}
          />
        </View>
        {invalid ? <Text variant="caption" className="mt-1.5 text-destructive">Enter a hex colour like #0069a8.</Text> : null}
      </View>
      <View
        {...plane}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Saturation and brightness"
        accessibilityValue={{ text: `Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%` }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) => update({ ...hsv, v: clamp(hsv.v + (event.nativeEvent.actionName === "increment" ? 0.05 : -0.05), 0, 1) })}
        className="h-40 overflow-hidden rounded-md border border-border"
      >
        <View pointerEvents="none" className="absolute inset-0">
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id={`${ids}white`} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#ffffff" stopOpacity={1} />
                <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
              </LinearGradient>
              <LinearGradient id={`${ids}black`} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#000000" stopOpacity={0} />
                <Stop offset="1" stopColor="#000000" stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={hueColour} />
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${ids}white)`} />
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${ids}black)`} />
          </Svg>
        </View>
        <Thumb colour={hex} left={`${hsv.s * 100}%`} top={`${(1 - hsv.v) * 100}%`} />
      </View>
      <View
        {...hue}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Hue"
        accessibilityValue={{ min: 0, max: 360, now: Math.round(hsv.h) }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(event) => update({ ...hsv, h: (hsv.h + (event.nativeEvent.actionName === "increment" ? 10 : 350)) % 360 })}
        className="h-8 justify-center"
      >
        <View pointerEvents="none" className="h-3 overflow-hidden rounded-[3px] border border-border">
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id={`${ids}hue`} x1="0" y1="0" x2="1" y2="0">
                {HUES.map((colour, index) => <Stop key={index} offset={index / (HUES.length - 1)} stopColor={colour} />)}
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${ids}hue)`} />
          </Svg>
        </View>
        <Thumb colour={hueColour} left={`${(hsv.h / 360) * 100}%`} top="50%" />
      </View>
    </View>
  );
}
