import { View } from "react-native";
import { DARK_PALETTES, LIGHT_PALETTES, PALETTE_NAMES, PALETTE_SWATCHES, type DarkPalette, type LightPalette, type Scheme } from "@/lib/theme/model";
import { SwatchTile, TileGrid } from "./tiles";

type Palette = LightPalette | DarkPalette;

/** The website's palette picker: surface, raised surface and a strip of the text colour. */
export function PalettePicker({ scheme, value, onChange }: { scheme: Scheme; value: Palette; onChange(palette: Palette): void }) {
  const palettes: readonly Palette[] = scheme === "light" ? LIGHT_PALETTES : DARK_PALETTES;
  const swatches = PALETTE_SWATCHES[scheme] as Record<Palette, readonly [string, string, string]>;
  return (
    <TileGrid
      items={palettes}
      minTile={96}
      max={3}
      label={scheme === "light" ? "Light palette" : "Dark palette"}
      render={(palette, width) => {
        const [surface, raised, text] = swatches[palette];
        return (
          <SwatchTile key={palette} name={PALETTE_NAMES[palette]} accessibilityLabel={`${PALETTE_NAMES[palette]} ${scheme} palette`} selected={palette === value} onPress={() => onChange(palette)} width={width}>
            <View className="h-8 flex-row overflow-hidden rounded-[4px] border border-black/10">
              <View className="flex-1" style={{ backgroundColor: surface }} />
              <View className="flex-1" style={{ backgroundColor: raised }} />
              <View className="w-2" style={{ backgroundColor: text }} />
            </View>
          </SwatchTile>
        );
      }}
    />
  );
}
