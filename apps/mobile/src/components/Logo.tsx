import { Image } from "expo-image";
import { useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { WEB_ORIGIN } from "@/lib/config";
import { useAppearance } from "@/providers/AppearanceProvider";
// The web's logo manifest and resolver are plain data and functions; sharing them
// keeps organisation and provider logos identical to phaseo.app without a copy.
import { resolveLogo } from "../../../web/src/lib/logos";

/** A logo on its own, without the tile: for buttons, chips and dense lists. Renders nothing if unknown. */
export function LogoMark({ id, size = 18 }: { id: string; size?: number }) {
  const { resolved } = useAppearance();
  const [failed, setFailed] = useState(false);
  const logo = resolveLogo(id, { theme: resolved, fallbackToColor: true });
  if (!logo?.src || failed) return null;
  return <Image source={{ uri: `${WEB_ORIGIN}${logo.src}` }} style={{ width: size, height: size }} contentFit="contain" cachePolicy="disk" onError={() => setFailed(true)} accessibilityElementsHidden importantForAccessibility="no" />;
}

/** `bare` draws the logo on its own (as web chat does beside model names); unknown labs still get a letter tile. */
export function Logo({ id, label, colour, size = 32, className, bare }: { id?: string | null; label?: string | null; colour?: string | null; size?: number; className?: string; bare?: boolean }) {
  const { resolved } = useAppearance();
  const [failed, setFailed] = useState(false);
  const logo = id ? resolveLogo(id, { theme: resolved, fallbackToColor: true }) : null;
  const src = logo?.src && !failed ? `${WEB_ORIGIN}${logo.src}` : null;
  const name = label ?? logo?.label ?? id ?? "?";
  // rounded-md (8 px) on normal tiles; small tiles scale down so they stay squares, not circles.
  const radius = Math.min(8, Math.round(size * 0.25));

  if (src && bare) {
    return <Image source={{ uri: src }} style={{ width: size, height: size }} contentFit="contain" cachePolicy="disk" onError={() => setFailed(true)} accessibilityLabel={`${name} logo`} />;
  }
  if (src) {
    return (
      <View className={cn("items-center justify-center overflow-hidden border border-border bg-background", className)} style={{ width: size, height: size, borderRadius: radius }}>
        <Image source={{ uri: src }} style={{ width: size * 0.66, height: size * 0.66 }} contentFit="contain" cachePolicy="disk" onError={() => setFailed(true)} accessibilityLabel={`${name} logo`} />
      </View>
    );
  }
  return (
    <View className={cn("items-center justify-center bg-muted", className)} style={{ width: size, height: size, borderRadius: radius, backgroundColor: colour ?? undefined }}>
      <Text variant="label" className={cn(colour ? "text-white" : "text-muted-foreground")} style={{ fontSize: size * 0.42 }}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}
