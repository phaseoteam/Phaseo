import { View } from "react-native";
import { PALETTE_SWATCHES, THEME_PRESETS, activePreset, presetFields, type ThemeFields } from "@/lib/theme/model";
import { SwatchTile, TileGrid } from "./tiles";

/**
 * The website's presets: each tile is split light/dark, with each half's accent as a small square,
 * so a preset shows both of its looks at once.
 */
export function ThemePresetGrid({ theme, onChange }: { theme: ThemeFields; onChange(theme: ThemeFields): void }) {
  const active = activePreset(theme);
  return (
    <TileGrid
      items={THEME_PRESETS}
      minTile={96}
      max={6}
      label="Theme preset"
      render={(preset, width) => (
        <SwatchTile key={preset.id} name={preset.name} accessibilityLabel={`${preset.name} theme`} selected={active?.id === preset.id} onPress={() => onChange(presetFields(preset))} width={width}>
          <View className="h-10 flex-row overflow-hidden rounded-[4px] border border-black/10">
            <View className="flex-1" style={{ backgroundColor: PALETTE_SWATCHES.light[preset.lightPalette][0] }}>
              <View className="absolute bottom-1 left-1 h-2 w-2 rounded-[2px]" style={{ backgroundColor: preset.lightAccent }} />
            </View>
            <View className="flex-1" style={{ backgroundColor: PALETTE_SWATCHES.dark[preset.darkPalette][0] }}>
              <View className="absolute bottom-1 right-1 h-2 w-2 rounded-[2px]" style={{ backgroundColor: preset.darkAccent }} />
            </View>
          </View>
        </SwatchTile>
      )}
    />
  );
}
