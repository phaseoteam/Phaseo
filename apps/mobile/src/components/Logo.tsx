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

export function Logo({ id, label, colour, size = 32, className }: { id?: string | null; label?: string | null; colour?: string | null; size?: number; className?: string }) {
  const { resolved } = useAppearance();
  const [failed, setFailed] = useState(false);
  const logo = id ? resolveLogo(id, { theme: resolved, fallbackToColor: true }) : null;
  const src = logo?.src && !failed ? `${WEB_ORIGIN}${logo.src}` : null;
  const name = label ?? logo?.label ?? id ?? "?";
  const radius = Math.round(size * 0.28);

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
