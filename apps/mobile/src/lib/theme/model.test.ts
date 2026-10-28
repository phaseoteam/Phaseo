import { readFileSync } from "fs";
import { join } from "path";
import { alphaOf, contrastRatio, toHex } from "./colour";
import {
  activePreset,
  checkAccent,
  DARK_PALETTES,
  DEFAULT_THEME,
  LIGHT_PALETTES,
  linkColour,
  normalizeMode,
  normalizeTheme,
  PALETTE_TOKENS,
  presetFields,
  presetMatches,
  previewColours,
  SUGGESTED_ACCENTS,
  surfacesFor,
  THEME_PRESETS,
  themeVariables,
  type Scheme,
  type ThemeFields,
} from "./model";

const SCHEMES: Scheme[] = ["light", "dark"];

describe("presets", () => {
  it("are the website's, in its order and with its colours", () => {
    expect(THEME_PRESETS.map((preset) => [preset.id, preset.name, preset.lightPalette, preset.darkPalette, preset.lightAccent, preset.darkAccent])).toEqual([
      ["phaseo", "Phaseo", "phaseo", "phaseo", "#0069a8", "#0078b8"],
      ["carbon", "Carbon", "paper", "slate", "#334155", "#60a5fa"],
      ["midnight", "Midnight", "paper", "midnight", "#4f46e5", "#818cf8"],
      ["forest", "Forest", "warm", "slate", "#15803d", "#4ade80"],
      ["ember", "Ember", "warm", "midnight", "#c2410c", "#fb923c"],
      ["orchid", "Orchid", "paper", "midnight", "#7c3aed", "#c084fc"],
    ]);
  });

  it("start from Phaseo, which is the website's default", () => {
    expect(presetFields(THEME_PRESETS[0]!)).toEqual(DEFAULT_THEME);
    expect(activePreset(DEFAULT_THEME)?.id).toBe("phaseo");
  });

  it("match only when all four fields do, ignoring accent case", () => {
    for (const preset of THEME_PRESETS) {
      expect(THEME_PRESETS.filter((candidate) => presetMatches(presetFields(preset), candidate))).toEqual([preset]);
    }
    expect(activePreset({ ...DEFAULT_THEME, lightAccent: "#0069A8" })?.id).toBe("phaseo");
    expect(activePreset({ ...DEFAULT_THEME, darkAccent: "#fbbf24" })).toBeNull();
    expect(activePreset({ ...DEFAULT_THEME, lightPalette: "warm" })).toBeNull();
  });
});

describe("normalizeTheme", () => {
  it("falls back field by field, like the website", () => {
    expect(normalizeTheme(null)).toEqual(DEFAULT_THEME);
    expect(normalizeTheme("carbon")).toEqual(DEFAULT_THEME);
    expect(normalizeTheme([])).toEqual(DEFAULT_THEME);
    expect(normalizeTheme({ lightPalette: "slate", darkPalette: "warm", lightAccent: "#ABCDEF", darkAccent: "red" })).toEqual({
      lightPalette: "phaseo",
      darkPalette: "phaseo",
      lightAccent: "#abcdef",
      darkAccent: "#0078b8",
    });
    expect(normalizeTheme({ lightPalette: "warm", darkPalette: "midnight", lightAccent: "#c2410c", darkAccent: "#fb923c", locale: "en-GB" })).toEqual({
      lightPalette: "warm", darkPalette: "midnight", lightAccent: "#c2410c", darkAccent: "#fb923c",
    });
  });

  it("keeps the mode to system, light or dark", () => {
    expect(normalizeMode("dark")).toBe("dark");
    expect(normalizeMode("auto")).toBe("system");
    expect(normalizeMode(null)).toBe("system");
  });
});

describe("themeVariables", () => {
  it("sets every surface token from the palette and the accent tokens from the accent", () => {
    const variables = themeVariables({ lightPalette: "warm", darkPalette: "midnight", lightAccent: "#c2410c", darkAccent: "#fb923c" }, "dark");
    expect(variables["--color-background"]).toBe(PALETTE_TOKENS.dark.midnight.background);
    expect(variables["--color-border"]).toBe("oklch(0.31 0.045 270 / 55%)");
    expect(variables["--color-primary"]).toBe("#fb923c");
    expect(variables["--color-ring"]).toBe("#fb923c");
    expect(variables["--color-chart-4"]).toBe("#fb923c");
    expect(variables["--color-primary-foreground"]).toBe("#0b0b0b");
    expect(Object.keys(variables)).toHaveLength(28);
  });

  it("derives Phaseo's accent tokens", () => {
    expect(themeVariables(DEFAULT_THEME, "light")).toMatchObject({
      "--color-primary": "#0069a8",
      "--color-primary-foreground": "#ffffff",
      "--color-link": "#0069a8",
      "--color-chart-1": "#9fbfdc",
      "--color-chart-5": "#0f5281",
    });
    expect(themeVariables(DEFAULT_THEME, "dark")).toMatchObject({
      "--color-primary": "#0078b8",
      "--color-primary-foreground": "#ffffff",
      "--color-link": "#4baaed",
    });
  });

  it("matches global.css, which holds the Phaseo theme before the store applies one", () => {
    const css = readFileSync(join(__dirname, "../../../global.css"), "utf8");
    for (const scheme of SCHEMES) {
      const block = new RegExp(`@variant ${scheme} \\{([^}]*)\\}`).exec(css)?.[1] ?? "";
      const declared = Object.fromEntries([...block.matchAll(/(--color-[\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2]!.trim()]));
      for (const [name, value] of Object.entries(themeVariables(DEFAULT_THEME, scheme))) {
        expect([name, toHex(declared[name] ?? "missing"), alphaOf(declared[name] ?? "")]).toEqual([name, toHex(value), alphaOf(value)]);
      }
    }
  });
});

describe("links and contrast", () => {
  const stress: ThemeFields[] = [
    ...THEME_PRESETS.map(presetFields),
    { ...DEFAULT_THEME, lightAccent: "#fbbf24", darkAccent: "#1e1b4b" },
    { ...DEFAULT_THEME, lightAccent: "#ffffff", darkAccent: "#000000" },
    ...LIGHT_PALETTES.flatMap((lightPalette) => DARK_PALETTES.map((darkPalette) => ({ lightPalette, darkPalette, lightAccent: "#fde047", darkAccent: "#312e81" }))),
  ];

  it("keeps links readable on every surface: 4.5:1 light, 7:1 dark", () => {
    for (const theme of stress) {
      for (const scheme of SCHEMES) {
        const link = linkColour(theme, scheme);
        for (const surface of surfacesFor(theme, scheme)) {
          expect(contrastRatio(link, surface)).toBeGreaterThanOrEqual(scheme === "light" ? 4.5 : 7);
        }
      }
    }
  });

  it("uses the accent itself as the link when it already reads well", () => {
    expect(linkColour(DEFAULT_THEME, "light")).toBe("#0069a8");
    expect(linkColour({ ...DEFAULT_THEME, darkAccent: "#fbbf24" }, "dark")).toBe("#fbbf24");
  });

  it("flags accents under 3:1 against the palette background", () => {
    expect(checkAccent("#fbbf24", "phaseo", "light")).toMatchObject({ low: true, foreground: "#0b0b0b" });
    expect(checkAccent("#fbbf24", "phaseo", "light").ratio).toBeCloseTo(1.67, 2);
    expect(checkAccent("#1e1b4b", "phaseo", "dark")).toMatchObject({ low: true, foreground: "#ffffff" });
    expect(checkAccent("#1e1b4b", "phaseo", "light").low).toBe(false);
    expect(checkAccent("#fbbf24", "midnight", "dark").low).toBe(false);
  });

  it("never flags the presets or the suggested accents on Phaseo", () => {
    for (const preset of THEME_PRESETS) {
      expect(checkAccent(preset.lightAccent, preset.lightPalette, "light").low).toBe(false);
      expect(checkAccent(preset.darkAccent, preset.darkPalette, "dark").low).toBe(false);
    }
    for (const scheme of SCHEMES) {
      for (const accent of SUGGESTED_ACCENTS[scheme]) expect(checkAccent(accent, "phaseo", scheme).low).toBe(false);
    }
  });
});

describe("previewColours", () => {
  it("draws translucent dark borders as the solid colour they show", () => {
    const dark = previewColours(DEFAULT_THEME, "dark");
    expect(dark.card).toBe("#171717");
    expect(dark.border).toBe("#2e2e2e");
    expect(previewColours(DEFAULT_THEME, "light").border).toBe(toHex("oklch(0.922 0 0)"));
  });
});
