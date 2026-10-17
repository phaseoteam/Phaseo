import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import type { LucideIcon } from "lucide-react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import type { PropsWithChildren, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { phaseoWordmarkXml } from "@/assets/phaseoWordmark";
import { useResolvedDark } from "@/providers/ThemePreference";
import { colour, font, icon, radius, space } from "@/theme";

export function usePalette() {
  const dark = useResolvedDark();
  return {
    dark,
    bg: dark ? colour.black : colour.white,
    surface: dark ? colour.grey900 : colour.grey50,
    card: dark ? colour.grey900 : colour.white,
    text: dark ? colour.grey50 : colour.black,
    muted: dark ? colour.grey400 : colour.grey600,
    border: dark ? colour.grey800 : colour.grey200
  };
}

export function BrandWordmark() {
  const { dark } = usePalette();
  return <SvgXml accessibilityLabel="Phaseo" xml={phaseoWordmarkXml(dark)} width={96} height={20} />;
}

export function AppHeader({ title, back = false, right }: { title?: string; back?: boolean; right?: ReactNode }) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return <View style={[styles.header, { backgroundColor: p.bg, borderBottomColor: p.border, paddingTop: insets.top }]}>
    <View style={styles.headerRow}>
      <View style={styles.headerLeading}>
        {back ? <Pressable accessibilityLabel="Go back" hitSlop={8} onPress={() => router.back()} style={styles.headerBack}><ChevronLeft color={p.text} size={22} strokeWidth={1.8} /></Pressable> : <BrandWordmark />}
        {title ? <Text style={[styles.headerTitle, { color: p.text }]}>{title}</Text> : null}
      </View>
      {right ?? <View style={styles.headerPlaceholder} />}
    </View>
  </View>;
}

export function Screen({ children, showHeader = true, headerTitle, headerBack, headerRight }: PropsWithChildren<{ showHeader?: boolean; headerTitle?: string; headerBack?: boolean; headerRight?: ReactNode }>) {
  const p = usePalette();
  return <View style={[styles.screen, { backgroundColor: p.bg }]}>{showHeader ? <AppHeader title={headerTitle} back={headerBack} right={headerRight} /> : null}{children}</View>;
}

export function PageIntro({ eyebrow, title, body, centered = false }: { eyebrow?: string; title: string; body?: string; centered?: boolean }) {
  const p = usePalette();
  return <View style={[styles.pageIntro, centered && styles.pageIntroCentered]}>
    {eyebrow ? <Text style={[styles.eyebrow, { color: colour.blue }]}>{eyebrow}</Text> : null}
    <Text style={[styles.pageTitle, centered && styles.centeredText, { color: p.text }]}>{title}</Text>
    {body ? <Text style={[styles.pageBody, centered && styles.centeredText, { color: p.muted }]}>{body}</Text> : null}
  </View>;
}

export function ActionButton({ label, onPress, variant = "primary", icon: Icon }: { label: string; onPress: () => void; variant?: "primary" | "outline"; icon?: LucideIcon }) {
  const p = usePalette();
  return <Pressable accessibilityRole="button" onPress={() => { void Haptics.selectionAsync(); onPress(); }} style={({ pressed }) => [styles.actionButton, variant === "primary" ? styles.actionButtonPrimary : [styles.actionButtonOutline, { borderColor: p.border }], pressed && styles.pressed]}>
    {Icon ? <Icon color={variant === "primary" ? colour.white : p.text} size={16} strokeWidth={1.9} /> : null}
    <Text style={[styles.actionButtonLabel, { color: variant === "primary" ? colour.white : p.text }]}>{label}</Text>
  </Pressable>;
}

export function Section({ title, children, footer }: PropsWithChildren<{ title: string; footer?: string }>) {
  const p = usePalette();
  return <View style={styles.section}>
    <Text style={[styles.heading, { color: p.text }]}>{title}</Text>
    <View style={[styles.card, { backgroundColor: p.card, borderColor: p.border }]}>{children}</View>
    {footer ? <Text style={[styles.footer, { color: p.muted }]}>{footer}</Text> : null}
  </View>;
}

export function Row({ icon: Icon, leading, title, subtitle, trailing, onPress }: { icon?: LucideIcon; leading?: ReactNode; title: string; subtitle?: string; trailing?: ReactNode; onPress?: () => void }) {
  const p = usePalette();
  return <Pressable accessibilityRole={onPress ? "button" : undefined} onPress={() => { if (onPress) void Haptics.selectionAsync(); onPress?.(); }} style={({ pressed }) => [styles.row, { borderBottomColor: p.border }, pressed && [styles.rowPressed, { backgroundColor: p.surface }]]}>
    {leading ?? (Icon ? <Icon color={p.muted} size={icon.row} strokeWidth={icon.stroke} /> : <View style={styles.iconPlaceholder} />)}
    <View style={styles.grow}><Text style={[styles.rowTitle, { color: p.text }]}>{title}</Text>{subtitle ? <Text style={[styles.subtitle, { color: p.muted }]}>{subtitle}</Text> : null}</View>
    {trailing ?? (onPress ? <ChevronRight color={p.muted} size={18} strokeWidth={1.7} /> : null)}
  </Pressable>;
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  const p = usePalette();
  return <View style={styles.empty}><Text style={[styles.emptyTitle, { color: p.text }]}>{title}</Text><Text style={[styles.subtitle, { color: p.muted }]}>{body}</Text></View>;
}

export function Pill({ children, tone = "neutral" }: PropsWithChildren<{ tone?: "neutral" | "blue" | "green" | "red" }>) {
  const p = usePalette();
  const c = tone === "blue" ? colour.blue : tone === "green" ? colour.green : tone === "red" ? colour.red : p.muted;
  return <View style={[styles.pill, { borderColor: c, backgroundColor: tone === "blue" ? `${colour.blue}12` : "transparent" }]}><Text style={[styles.pillText, { color: c }]}>{children}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { borderBottomWidth: StyleSheet.hairlineWidth },
  headerRow: { height: 60, paddingHorizontal: space.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLeading: { flexDirection: "row", alignItems: "center", gap: space.sm },
  headerBack: { width: 32, height: 36, alignItems: "center", justifyContent: "center", marginLeft: -space.sm },
  headerTitle: { fontFamily: font.semibold, fontSize: 15 },
  headerPlaceholder: { width: 32, height: 32 },
  pageIntro: { paddingHorizontal: space.lg, paddingTop: space.xl, gap: space.sm },
  pageIntroCentered: { alignItems: "center" },
  eyebrow: { fontFamily: font.bold, fontSize: 11, letterSpacing: 1.1, textTransform: "uppercase" },
  pageTitle: { fontFamily: font.bold, fontSize: 30, letterSpacing: -0.7, lineHeight: 36 },
  pageBody: { fontFamily: font.regular, fontSize: 15, lineHeight: 23 },
  centeredText: { textAlign: "center" },
  actionButton: { minHeight: 44, borderRadius: radius.md, paddingHorizontal: space.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.sm },
  actionButtonPrimary: { backgroundColor: colour.blue },
  actionButtonOutline: { borderWidth: 1 },
  actionButtonLabel: { fontFamily: font.semibold, fontSize: 13 },
  pressed: { opacity: 0.72 },
  section: { marginHorizontal: space.lg, marginTop: space.xl, gap: space.sm },
  heading: { fontFamily: font.semibold, fontSize: 15, letterSpacing: -0.1 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, overflow: "hidden" },
  footer: { fontFamily: font.regular, fontSize: 12, lineHeight: 17, marginHorizontal: space.sm },
  row: { minHeight: 56, paddingHorizontal: space.lg, paddingVertical: space.md, flexDirection: "row", alignItems: "center", gap: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  rowPressed: { opacity: 0.72 },
  iconPlaceholder: { width: icon.row },
  grow: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: font.semibold, fontSize: 14 },
  subtitle: { fontFamily: font.regular, fontSize: 12, lineHeight: 18 },
  empty: { minHeight: 148, padding: space.xxl, alignItems: "center", justifyContent: "center", gap: space.sm },
  emptyTitle: { fontFamily: font.semibold, fontSize: 15, textAlign: "center" },
  pill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4 },
  pillText: { fontFamily: font.semibold, fontSize: 11 }
});
