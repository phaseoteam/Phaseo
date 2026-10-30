import { Image } from "expo-image";
import { useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui";
import { cn } from "@/lib/cn";
import { WEB_ORIGIN } from "@/lib/config";
import { logoResolverStore } from "@/lib/logos";
import { useAppearance } from "@/providers/AppearanceProvider";

/**
 * Where a lab's or provider's logo is on phaseo.app, or null for an unknown ID (also for `Image.prefetch`). The logo
 * list is shared with the website (@phaseo/app-kit) and topped up from phaseo.app (lib/logos.ts).
 */
export function logoUri(id: string, theme: "light" | "dark", resolver = logoResolverStore.get()) {
  const logo = resolver.resolveLogo(id, { theme, fallbackToColor: true });
  return logo?.src ? `${WEB_ORIGIN}${logo.src}` : null;
}

/** A logo on its own, without the tile: for buttons, chips and dense lists. Renders nothing if unknown. */
export function LogoMark({ id, size = 18 }: { id: string; size?: number }) {
  const { resolved } = useAppearance();
  const [failed, setFailed] = useState(false);
  const resolver = logoResolverStore.use();
  const uri = logoUri(id, resolved, resolver);
  if (!uri || failed) return null;
  return <Image source={{ uri }} style={{ width: size, height: size }} contentFit="contain" cachePolicy="disk" onError={() => setFailed(true)} accessibilityElementsHidden importantForAccessibility="no" />;
}

/** A logo tile's corner radius: rounded-md (8 px) on normal tiles; small tiles scale down so they stay squares, not circles. */
export function logoTileRadius(size: number) {
  return Math.min(8, Math.round(size * 0.25));
}

/** `bare` draws the logo on its own (as web chat does beside model names); unknown labs still get a letter tile. */
export function Logo({ id, label, colour, size = 32, className, bare }: { id?: string | null; label?: string | null; colour?: string | null; size?: number; className?: string; bare?: boolean }) {
  const { resolved } = useAppearance();
  const [failed, setFailed] = useState(false);
  const resolver = logoResolverStore.use();
  const logo = id ? resolver.resolveLogo(id, { theme: resolved, fallbackToColor: true }) : null;
  const src = logo?.src && !failed ? `${WEB_ORIGIN}${logo.src}` : null;
  const name = label ?? logo?.label ?? id ?? "?";
  const radius = logoTileRadius(size);

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
