import { Check, Pipette, TriangleAlert } from "lucide-react-native";
import { useState } from "react";
import { Text as NativeText, Pressable, View } from "react-native";
import { Button, Icon, Sheet, Text } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { cn } from "@/lib/cn";
import { readableForegroundForAccent } from "@/lib/theme/colour";
import { accentFor, checkAccent, PALETTE_NAMES, previewColours, SUGGESTED_ACCENTS, type AccentCheck, type Scheme, type ThemeFields } from "@/lib/theme/model";
import { ColourPicker } from "./ColourPicker";

const accentKey = (scheme: Scheme) => (scheme === "light" ? "lightAccent" : "darkAccent");
const paletteOf = (theme: ThemeFields, scheme: Scheme) => (scheme === "light" ? theme.lightPalette : theme.darkPalette);
const schemeName = (scheme: Scheme) => (scheme === "light" ? "Light" : "Dark");

/** What a low-contrast accent means in practice, in a sentence. */
function ContrastNote({ check, scheme, className }: { check: AccentCheck; scheme: Scheme; className?: string }) {
  if (!check.low) return null;
  return (
    <View accessibilityLiveRegion="polite" className={cn("flex-row gap-2", className)}>
      <View className="pt-0.5"><Icon icon={TriangleAlert} tone="warning" size={14} /></View>
      <Text variant="caption" className="flex-1">
        {`Hard to see on this background (${check.ratio.toFixed(1)}:1). Button text stays readable, and links use a ${scheme === "dark" ? "lighter" : "darker"} shade.`}
      </Text>
    </View>
  );
}

function AccentSwatch({ colour, selected, onPress }: { colour: string; selected: boolean; onPress(): void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={colour}
      hitSlop={2}
      onPress={onPress}
      className={cn("h-10 w-10 items-center justify-center rounded-md border-2", selected ? "border-foreground" : "border-transparent")}
    >
      <View className="h-8 w-8 items-center justify-center rounded-[5px] border border-black/10" style={{ backgroundColor: colour }}>
        {selected ? <Icon icon={Check} color={readableForegroundForAccent(colour)} size={16} strokeWidth={2.6} /> : null}
      </View>
    </Pressable>
  );
}

/** Suggested accents, then "Custom" for any colour; a note when the accent is hard to see on the palette. */
export function AccentPicker({ scheme, theme, onChange }: { scheme: Scheme; theme: ThemeFields; onChange(theme: ThemeFields): void }) {
  const [editing, setEditing] = useState(false);
  const accent = accentFor(theme, scheme);
  const suggestions = SUGGESTED_ACCENTS[scheme];
  const custom = !suggestions.includes(accent);
  const choose = (colour: string) => onChange({ ...theme, [accentKey(scheme)]: colour });

  return (
    <View>
      <View accessibilityRole="radiogroup" accessibilityLabel={`${schemeName(scheme)} accent`} className="mx-4 flex-row flex-wrap gap-1.5">
        {suggestions.map((colour) => <AccentSwatch key={colour} colour={colour} selected={colour === accent} onPress={() => choose(colour)} />)}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={custom ? `Custom ${schemeName(scheme).toLowerCase()} accent, ${accent}. Edit` : `Custom ${schemeName(scheme).toLowerCase()} accent`}
          onPress={() => setEditing(true)}
          className={cn("h-10 flex-row items-center gap-2 rounded-md border-2 px-2.5 active:bg-accent", custom ? "border-foreground" : "border-border")}
        >
          {custom ? <View className="h-5 w-5 rounded-[4px] border border-black/10" style={{ backgroundColor: accent }} /> : <Icon icon={Pipette} tone="muted" size={16} />}
          <Text variant="small" className={cn(custom ? "font-mono" : "font-semibold")}>{custom ? accent : "Custom"}</Text>
        </Pressable>
      </View>
      <ContrastNote check={checkAccent(accent, paletteOf(theme, scheme), scheme)} scheme={scheme} className="mx-4 mt-2.5" />
      <Sheet open={editing} onClose={() => setEditing(false)}>
        {editing ? <AccentEditor scheme={scheme} theme={theme} onClose={() => setEditing(false)} onApply={(colour) => { choose(colour); setEditing(false); }} /> : null}
      </Sheet>
    </View>
  );
}

/** The custom colour dialog: picker, a sample on the palette, the contrast check, then Cancel / Use colour. */
function AccentEditor({ scheme, theme, onClose, onApply }: { scheme: Scheme; theme: ThemeFields; onClose(): void; onApply(colour: string): void }) {
  const { split } = useLayout();
  const initial = accentFor(theme, scheme);
  const [draft, setDraft] = useState(initial);
  const [valid, setValid] = useState(true);
  const palette = paletteOf(theme, scheme);
  const check = checkAccent(draft, palette, scheme);
  const colours = previewColours({ ...theme, [accentKey(scheme)]: draft }, scheme);

  return (
    <View className={split ? "p-5" : "px-4 pb-1 pt-5"}>
      <Text variant="heading">{`${schemeName(scheme)} accent`}</Text>
      <Text variant="muted" className="mt-1">Drag to choose a colour, or type its hex code.</Text>
      <View className="mt-4">
        <ColourPicker value={initial} onChange={setDraft} onValidChange={setValid} />
      </View>
      <View accessible accessibilityLabel={`Sample on the ${PALETTE_NAMES[palette]} ${scheme} background, contrast ${check.ratio.toFixed(1)} to 1`} className="mt-3 flex-row items-center gap-3 rounded-md border p-3" style={{ backgroundColor: colours.background, borderColor: colours.border }}>
        <View className="h-8 justify-center rounded-[6px] px-3" style={{ backgroundColor: colours.primary }}>
          <NativeText className="font-sans text-[13px] font-semibold" style={{ color: colours.primaryForeground }}>Button</NativeText>
        </View>
        <NativeText className="font-sans text-[13px] font-semibold" style={{ color: colours.link }}>Link</NativeText>
        <NativeText className="ml-auto font-sans text-[12px]" style={{ color: colours.mutedForeground }}>{`${check.ratio.toFixed(1)}:1`}</NativeText>
      </View>
      <ContrastNote check={check} scheme={scheme} className="mt-2.5" />
      {split ? (
        <View className="mt-5 flex-row justify-end gap-2">
          <Button label="Cancel" variant="outline" size="sm" onPress={onClose} />
          <Button label="Use colour" size="sm" disabled={!valid} onPress={() => onApply(draft)} />
        </View>
      ) : (
        <View className="mt-4 gap-2">
          <Button label="Use colour" disabled={!valid} onPress={() => onApply(draft)} />
          <Button label="Cancel" variant="outline" onPress={onClose} />
        </View>
      )}
    </View>
  );
}
