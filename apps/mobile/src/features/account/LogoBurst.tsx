import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, { Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from "react-native-reanimated";
import { Logo } from "@/components/Logo";

export type BurstLab = { id: string; name: string; colour: string | null };

/** Big labs for when the catalogue hasn't loaded yet. */
export const FALLBACK_LABS: BurstLab[] = [
  { id: "openai", name: "OpenAI", colour: null },
  { id: "anthropic", name: "Anthropic", colour: null },
  { id: "google", name: "Google", colour: null },
  { id: "meta", name: "Meta", colour: null },
  { id: "mistral", name: "Mistral", colour: null },
  { id: "deepseek", name: "DeepSeek", colour: null },
  { id: "qwen", name: "Qwen", colour: null },
  { id: "z-ai", name: "Z.ai", colour: null },
  { id: "minimax", name: "MiniMax", colour: null },
  { id: "moonshotai", name: "Moonshot AI", colour: null },
  { id: "nvidia", name: "NVIDIA", colour: null },
  { id: "cohere", name: "Cohere", colour: null },
];

const DURATION = 1200;
const TILE = 36;

/**
 * The unlock's celebration: the labs' logos burst out from the middle of the screen and fade, in place of confetti.
 * Left out when the system reduces motion (the toast and haptic still say it worked). Screen readers skip it.
 */
export function LogoBurst({ labs, onDone }: { labs: BurstLab[]; onDone(): void }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(0);
  const [area, setArea] = useState<{ width: number; height: number } | null>(null);

  // `onDone` must be stable (useCallback), or the burst starts again on every render.
  useEffect(() => {
    if (reduced || !labs.length) {
      onDone();
      return;
    }
    progress.value = withTiming(1, { duration: DURATION, easing: Easing.out(Easing.cubic) });
    const timer = setTimeout(onDone, DURATION + 100);
    return () => clearTimeout(timer);
  }, [labs.length, onDone, progress, reduced]);

  if (reduced) return null;
  const reach = area ? Math.min(area.width, area.height) * 0.4 : 0;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="absolute inset-0"
      onLayout={(event) => setArea({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}
    >
      {area ? labs.map((lab, index) => {
        // Evenly round the circle, with a little spread in distance and spin so it doesn't look stamped out.
        const angle = (index / labs.length) * Math.PI * 2 - Math.PI / 2 + (index % 2 ? 0.18 : -0.12);
        const distance = reach * (0.7 + ((index * 37) % 10) / 33);
        return (
          <Particle
            key={lab.id}
            lab={lab}
            progress={progress}
            origin={{ x: area.width / 2 - TILE / 2, y: area.height / 2 - TILE / 2 }}
            to={{ x: Math.cos(angle) * distance, y: Math.sin(angle) * distance }}
            spin={(index % 2 ? 1 : -1) * (12 + (index % 4) * 6)}
          />
        );
      }) : null}
    </View>
  );
}

function Particle({ lab, progress, origin, to, spin }: { lab: BurstLab; progress: SharedValue<number>; origin: { x: number; y: number }; to: { x: number; y: number }; spin: number }) {
  const style = useAnimatedStyle(() => {
    const value = progress.value;
    return {
      opacity: interpolate(value, [0, 0.08, 0.7, 1], [0, 1, 1, 0]),
      transform: [
        { translateX: to.x * value },
        // A little gravity once the burst slows.
        { translateY: to.y * value + 36 * value * value },
        { scale: interpolate(value, [0, 0.25, 1], [0.4, 1.1, 0.85]) },
        { rotate: `${spin * value}deg` },
      ],
    };
  });
  return (
    <Animated.View style={[{ position: "absolute", left: origin.x, top: origin.y }, style]}>
      <Logo id={lab.id} label={lab.name} colour={lab.colour} size={TILE} />
    </Animated.View>
  );
}
