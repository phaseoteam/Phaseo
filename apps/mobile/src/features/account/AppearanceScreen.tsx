import { RotateCcw } from "lucide-react-native";
import { useSyncExternalStore, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { Button, confirm, Header, ReadableWidth, Row, Screen, Section, Segmented, Switch, Text } from "@/components/ui";
import { useLayout } from "@/hooks/useLayout";
import { hapticsStore, setHapticsEnabled } from "@/lib/haptics";
import { activePreset, DEFAULT_THEME, sameTheme, type DarkPalette, type LightPalette } from "@/lib/theme/model";
import { appearanceStore } from "@/lib/theme/store";
import { useAppearance, type ThemePreference } from "@/providers/AppearanceProvider";
import { useAuth } from "@/providers/AuthProvider";
import { AccentPicker } from "./appearance/AccentPicker";
import { PalettePicker } from "./appearance/PalettePicker";
import { ThemePresetGrid } from "./appearance/ThemePresetGrid";
import { ThemePreview } from "./appearance/ThemePreview";

const MODES: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** A small heading inside a section, over its own picker. */
function Part({ title, value, children }: { title: string; value?: string; children: ReactNode }) {
  return (
    <View className="mt-5">
      <View className="mb-2 flex-row items-baseline justify-between gap-3 px-4">
        <Text variant="label">{title}</Text>
        {value ? <Text variant="mono" selectable>{value}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** Where the theme is kept, in a line. */
function useSaveStatus() {
  const { session } = useAuth();
  const pending = useSyncExternalStore(appearanceStore.subscribe, () => appearanceStore.get().pending != null);
  if (!session) return "Kept on this device. Sign in to use it on the website too.";
  return pending ? "Saving to your account…" : "Saved to your account, so the website matches.";
}

/**
 * Mode, then the website's presets, then custom palettes and accents with a live preview, then haptics. Everything
 * applies at once; the theme is saved to the account when signed in (see ThemeSync), and haptics stay on this device.
 */
export function AppearanceScreen() {
  const { split } = useLayout();
  const { preference, resolved, theme, setPreference, setTheme } = useAppearance();
  const status = useSaveStatus();
  const haptics = hapticsStore.use((state) => state.enabled);

  const reset = async () => {
    // A preset can be picked again in one tap; custom colours can't, so ask first.
    if (!activePreset(theme)) {
      const ok = await confirm({ title: "Reset to Phaseo?", body: "Your custom palettes and accents will be replaced.", confirmLabel: "Reset" });
      if (!ok) return;
    }
    setTheme(DEFAULT_THEME);
  };

  return (
    <Screen>
      <Header back={!split} title="Appearance" />
      <ScrollView contentContainerClassName="pb-16">
        <ReadableWidth>
          <Section title="Mode" className="mt-2">
            <View className="px-4">
              <Segmented value={preference} options={MODES} onChange={setPreference} />
              <Text variant="caption" className="mt-2">
                {preference === "system" ? "Follows your phone's light or dark setting." : `Always ${preference}, whatever your phone uses.`}
              </Text>
            </View>
          </Section>

          <Section title="Theme" description={status}>
            <View className="mt-2">
              <ThemePresetGrid theme={theme} onChange={setTheme} />
            </View>
          </Section>

          <Section title="Custom" description="Choose each palette and accent yourself.">
            <View className="mt-2">
              <ThemePreview theme={theme} resolved={resolved} />
            </View>
            <Part title="Light palette">
              <PalettePicker scheme="light" value={theme.lightPalette} onChange={(palette) => setTheme({ ...theme, lightPalette: palette as LightPalette })} />
            </Part>
            <Part title="Light accent" value={theme.lightAccent}>
              <AccentPicker scheme="light" theme={theme} onChange={setTheme} />
            </Part>
            <Part title="Dark palette">
              <PalettePicker scheme="dark" value={theme.darkPalette} onChange={(palette) => setTheme({ ...theme, darkPalette: palette as DarkPalette })} />
            </Part>
            <Part title="Dark accent" value={theme.darkAccent}>
              <AccentPicker scheme="dark" theme={theme} onChange={setTheme} />
            </Part>
            <View className="mt-6 px-4">
              <Button label="Reset to Phaseo" icon={RotateCcw} variant="outline" disabled={sameTheme(theme, DEFAULT_THEME)} onPress={() => void reset()} className="self-start" />
            </View>
          </Section>

          <Section title="Touch" description="Small vibrations when you flip a switch, make a choice, long press, send a message, and when an answer finishes. Your phone's touch vibration setting applies too.">
            <Row
              title="Haptic feedback"
              chevron={false}
              last
              trailing={<Switch value={haptics} accessibilityLabel="Haptic feedback" onValueChange={setHapticsEnabled} />}
            />
          </Section>
        </ReadableWidth>
      </ScrollView>
    </Screen>
  );
}
