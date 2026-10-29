import { Text as NativeText, View, type TextStyle } from "react-native";
import { previewColours, type PreviewColours, type Scheme, type ThemeFields } from "@/lib/theme/model";

/** Plain text in an exact colour: the preview draws a scheme that may not be the one showing. */
function Tinted({ children, colour, className, style }: { children: string; colour: string; className?: string; style?: TextStyle }) {
  return <NativeText className={`font-sans ${className ?? ""}`} style={[{ color: colour }, style]}>{children}</NativeText>;
}

function MiniScreen({ label, colours, current }: { label: string; colours: PreviewColours; current: boolean }) {
  return (
    <View className="flex-1 rounded-md border p-3" style={{ backgroundColor: colours.background, borderColor: colours.border }}>
      <View className="flex-row items-center justify-between gap-2">
        <Tinted colour={colours.foreground} className="text-[13px] font-semibold">{label}</Tinted>
        {current ? <Tinted colour={colours.mutedForeground} className="text-[11px]">Showing now</Tinted> : null}
      </View>
      <View className="mt-2 rounded-[6px] border p-2.5" style={{ backgroundColor: colours.card, borderColor: colours.border }}>
        <Tinted colour={colours.foreground} className="text-[13px] font-semibold">This week</Tinted>
        <Tinted colour={colours.mutedForeground} className="mt-0.5 text-[12px]">$12.50 spent</Tinted>
        <Tinted colour={colours.link} className="mt-1 text-[12px] font-semibold">View usage</Tinted>
      </View>
      <View className="mt-2 flex-row gap-1.5">
        <View className="h-7 justify-center rounded-[6px] px-2.5" style={{ backgroundColor: colours.primary }}>
          <Tinted colour={colours.primaryForeground} className="text-[12px] font-semibold">Save</Tinted>
        </View>
        <View className="h-7 justify-center rounded-[6px] px-2.5" style={{ backgroundColor: colours.muted }}>
          <Tinted colour={colours.foreground} className="text-[12px]">Cancel</Tinted>
        </View>
      </View>
    </View>
  );
}

/** Both schemes side by side in the chosen palettes and accents, updating as they change. */
export function ThemePreview({ theme, resolved }: { theme: ThemeFields; resolved: Scheme }) {
  return (
    <View accessible accessibilityLabel="Preview of the light and dark themes" className="mx-4 flex-row gap-2">
      <MiniScreen label="Light" colours={previewColours(theme, "light")} current={resolved === "light"} />
      <MiniScreen label="Dark" colours={previewColours(theme, "dark")} current={resolved === "dark"} />
    </View>
  );
}
