import { DarkTheme, DefaultTheme, type Theme } from "expo-router";

export const colour = {
  blue: "#0066ff",
  white: "#ffffff",
  black: "#09090b",
  grey50: "#fafafa",
  grey100: "#f4f4f5",
  grey200: "#e4e4e7",
  grey400: "#a1a1aa",
  grey600: "#52525b",
  grey800: "#27272a",
  grey900: "#18181b",
  red: "#dc2626",
  green: "#16a34a",
  amber: "#d97706"
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 10, lg: 12, xl: 16, pill: 999 } as const;
export const icon = { nav: 22, row: 20, action: 18, stroke: 1.8 } as const;
export const motion = { fast: 140, normal: 220, slow: 320 } as const;
export const font = {
  regular: "Montserrat",
  semibold: "MontserratSemiBold",
  bold: "MontserratBold",
  mono: "monospace"
} as const;

export function navigationTheme(dark: boolean): Theme {
  const base = dark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: colour.blue,
      background: dark ? colour.black : colour.white,
      card: dark ? colour.black : colour.white,
      border: dark ? colour.grey800 : colour.grey200,
      text: dark ? colour.grey50 : colour.black,
      notification: colour.red
    }
  };
}
