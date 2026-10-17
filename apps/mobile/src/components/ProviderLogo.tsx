import { resolveLogo } from "@phaseo/brand-assets";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SvgUri } from "react-native-svg";
import { WEB_ORIGIN } from "@/lib/api";
import { usePalette } from "@/components/ui";
import { font, radius } from "@/theme";

export function ProviderLogo({ id, label, size = 32 }: { id?: string | null; label?: string | null; size?: number }) {
  const p = usePalette();
  const resolved = useMemo(() => id ? resolveLogo(id, { theme: p.dark ? "dark" : "light" }) : undefined, [id, p.dark]);
  const uri = resolved?.src ? `${WEB_ORIGIN}${resolved.src}` : undefined;
  const fallbackLabel = (label ?? resolved?.label ?? id ?? "?").trim().slice(0, 2).toUpperCase();

  return <View accessibilityLabel={label ?? resolved?.label ?? id ?? "Provider logo"} style={[styles.box, { width: size, height: size, borderColor: p.border, backgroundColor: p.bg }]}>
    <LogoContent key={uri ?? "fallback"} uri={uri} size={size} fallbackLabel={fallbackLabel} color={p.muted} />
  </View>;
}

function LogoContent({ uri, size, fallbackLabel, color }: { uri?: string; size: number; fallbackLabel: string; color: string }) {
  const [failed, setFailed] = useState(false);
  return uri && !failed ? <SvgUri uri={uri} width={size - 8} height={size - 8} onError={() => setFailed(true)} /> : <Text style={[styles.fallback, { color, fontSize: Math.max(9, size * 0.32) }]}>{fallbackLabel}</Text>;
}

const styles = StyleSheet.create({
  box: { alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm, overflow: "hidden" },
  fallback: { fontFamily: font.bold, letterSpacing: 0.2 }
});
