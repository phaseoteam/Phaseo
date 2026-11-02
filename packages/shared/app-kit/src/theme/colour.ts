/**
 * Colour maths for themes: hex parsing, HSV for the picker, OKLCH (the website's palettes are written
 * in it), WCAG contrast and OKLCH mixing (the website's `color-mix(in oklch, …)`). Pure, so it's tested
 * (apps/mobile/src/lib/theme/colour.test.ts).
 *
 * This file has no imports, so plain Node can load it (`node --experimental-strip-types`).
 */

export type Rgb = { r: number; g: number; b: number };
export type Hsv = { h: number; s: number; v: number };
export type Oklch = { l: number; c: number; h: number; alpha: number };

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** A stored accent: exactly `#rrggbb`, as the website and web-api accept. */
export function isHexColour(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
}

/** What someone typed (`#0069a8`, `0069A8`, `#06a`) as `#rrggbb` in lower case, or null. */
export function parseHex(input: string): string | null {
  const value = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{6}$/.test(value)) return `#${value}`;
  if (/^[0-9a-f]{3}$/.test(value)) return `#${value.split("").map((digit) => digit + digit).join("")}`;
  return null;
}

export function hexToRgb(hex: string): Rgb {
  const value = parseHex(hex) ?? "#000000";
  return {
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16),
  };
}

const channelHex = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");

export function rgbToHex({ r, g, b }: Rgb): string {
  return `#${channelHex(r)}${channelHex(g)}${channelHex(b)}`;
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const [red, green, blue] = [r / 255, g / 255, b / 255];
  const max = Math.max(red, green, blue);
  const delta = max - Math.min(red, green, blue);
  let h = 0;
  if (delta !== 0) {
    if (max === red) h = 60 * (((green - blue) / delta) % 6);
    else if (max === green) h = 60 * ((blue - red) / delta + 2);
    else h = 60 * ((red - green) / delta + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const hue = ((h % 360) + 360) % 360;
  const chroma = v * s;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = v - chroma;
  const [red, green, blue] =
    hue < 60 ? [chroma, x, 0]
      : hue < 120 ? [x, chroma, 0]
        : hue < 180 ? [0, chroma, x]
          : hue < 240 ? [0, x, chroma]
            : hue < 300 ? [x, 0, chroma]
              : [chroma, 0, x];
  return { r: (red + m) * 255, g: (green + m) * 255, b: (blue + m) * 255 };
}

export const hexToHsv = (hex: string) => rgbToHsv(hexToRgb(hex));
export const hsvToHex = (hsv: Hsv) => rgbToHex(hsvToRgb(hsv));

const toLinear = (channel: number) => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (value: number) => clamp((value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055) * 255, 0, 255);

/** WCAG relative luminance of a `#rrggbb` colour. */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG contrast ratio between two colours, from 1 to 21. */
export function contrastRatio(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Text on an accent fill: white or near-black, whichever contrasts more. The website sets
 * `--light-user-accent-foreground` and `--dark-user-accent-foreground` with it, and the mobile app its
 * primary foreground, so a button reads the same in both places.
 */
export function readableForegroundForAccent(value: string): "#ffffff" | "#0b0b0b" {
  const luminance = relativeLuminance(value);
  const whiteContrast = 1.05 / (luminance + 0.05);
  const darkContrast = (luminance + 0.05) / 0.052;
  return whiteContrast >= darkContrast ? "#ffffff" : "#0b0b0b";
}

export function rgbToOklch({ r, g, b }: Rgb, alpha = 1): Oklch {
  const [red, green, blue] = [toLinear(r), toLinear(g), toLinear(b)];
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bAxis = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const hue = (Math.atan2(bAxis, a) * 180) / Math.PI;
  return { l: lightness, c: Math.sqrt(a ** 2 + bAxis ** 2), h: hue < 0 ? hue + 360 : hue, alpha };
}

/** OKLCH to sRGB, clipped into gamut channel by channel (as browsers do for these mid-gamut colours). */
export function oklchToRgb({ l, c, h }: Pick<Oklch, "l" | "c" | "h">): Rgb {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);
  const lRoot = l + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = l - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = l - 0.0894841775 * a - 1.291485548 * b;
  const [lLinear, mLinear, sLinear] = [lRoot ** 3, mRoot ** 3, sRoot ** 3];
  return {
    r: fromLinear(4.0767416621 * lLinear - 3.3077115913 * mLinear + 0.2309699292 * sLinear),
    g: fromLinear(-1.2684380046 * lLinear + 2.6097574011 * mLinear - 0.3413193965 * sLinear),
    b: fromLinear(-0.0041960863 * lLinear - 0.7034186147 * mLinear + 1.707614701 * sLinear),
  };
}

export const hexToOklch = (hex: string) => rgbToOklch(hexToRgb(hex));
export const oklchToHex = (colour: Pick<Oklch, "l" | "c" | "h">) => rgbToHex(oklchToRgb(colour));

/** `oklch(0.5 0.134 242.749)`, `oklch(98.4% 0.003 247.858)` or `oklch(1 0 0 / 10%)`. */
export function parseOklch(css: string): Oklch | null {
  const match = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)(%?)\s*)?\)$/i.exec(css.trim());
  if (!match) return null;
  const l = Number(match[1]) / (match[2] ? 100 : 1);
  const alpha = match[5] == null ? 1 : Number(match[5]) / (match[6] ? 100 : 1);
  return { l, c: Number(match[3]), h: Number(match[4]), alpha };
}

/**
 * A palette or accent value as `#rrggbb`, ignoring alpha (for contrast checks on opaque surfaces).
 * Accepts the hex and OKLCH forms the theme tables use.
 */
export function toHex(css: string): string {
  const hex = parseHex(css);
  if (hex) return hex;
  const oklch = parseOklch(css);
  return oklch ? oklchToHex(oklch) : "#000000";
}

/** A translucent colour drawn over an opaque one (alpha from 0 to 1), as the screen shows it. */
export function composite(colour: string, surface: string, alpha: number): string {
  const top = hexToRgb(toHex(colour));
  const bottom = hexToRgb(toHex(surface));
  const a = clamp(alpha, 0, 1);
  return rgbToHex({ r: top.r * a + bottom.r * (1 - a), g: top.g * a + bottom.g * (1 - a), b: top.b * a + bottom.b * (1 - a) });
}

/** A CSS colour with its alpha (1 when opaque), for the hex and OKLCH forms the theme tables use. */
export function alphaOf(css: string): number {
  return parseOklch(css)?.alpha ?? 1;
}

/** Below this chroma a colour is grey and its hue means nothing (CSS calls it "powerless"). */
const ACHROMATIC = 0.0005;

/** `color-mix(in oklch, first weight%, second)`: hue takes the shorter way round, as CSS does. */
export function mixOklch(first: string, second: string, weight: number): string {
  const a = hexToOklch(toHex(first));
  const b = hexToOklch(toHex(second));
  const t = 1 - clamp(weight, 0, 1);
  let hueA = a.h;
  let hueB = b.h;
  if (a.c < ACHROMATIC) hueA = hueB;
  if (b.c < ACHROMATIC) hueB = hueA;
  let delta = hueB - hueA;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return oklchToHex({
    l: a.l + (b.l - a.l) * t,
    c: a.c + (b.c - a.c) * t,
    h: (hueA + delta * t + 360) % 360,
  });
}

/**
 * The accent moved along OKLCH lightness (towards white on dark surfaces, black on light ones) just far
 * enough to reach `target` contrast against every surface. Hue and chroma stay, so it still reads as the
 * accent. Returns the accent unchanged when it already passes.
 */
export function readableOn(accent: string, surfaces: string[], target: number, towards: "lighter" | "darker"): string {
  const passes = (colour: string) => surfaces.every((surface) => contrastRatio(colour, surface) >= target);
  if (passes(accent)) return accent;
  const start = hexToOklch(accent);
  const end = towards === "lighter" ? 1 : 0;
  // Binary search on lightness for the smallest move that passes.
  let low = 0;
  let high = 1;
  let best = oklchToHex({ ...start, l: end });
  for (let step = 0; step < 24; step += 1) {
    const middle = (low + high) / 2;
    const candidate = oklchToHex({ ...start, l: start.l + (end - start.l) * middle });
    if (passes(candidate)) {
      best = candidate;
      high = middle;
    } else {
      low = middle;
    }
  }
  return best;
}
