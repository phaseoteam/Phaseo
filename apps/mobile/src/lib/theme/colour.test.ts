import {
  alphaOf,
  composite,
  contrastRatio,
  hexToHsv,
  hexToRgb,
  hsvToHex,
  isHexColour,
  mixOklch,
  parseHex,
  parseOklch,
  readableForegroundForAccent,
  readableOn,
  rgbToHex,
  toHex,
} from "./colour";

describe("hex parsing", () => {
  it("accepts six- and three-digit codes with or without #, in any case", () => {
    expect(parseHex("#0069A8")).toBe("#0069a8");
    expect(parseHex("0069a8")).toBe("#0069a8");
    expect(parseHex("  #0069a8 ")).toBe("#0069a8");
    expect(parseHex("#06a")).toBe("#0066aa");
    expect(parseHex("FFF")).toBe("#ffffff");
  });

  it("rejects anything else", () => {
    for (const input of ["", "#", "#12", "#1234", "#12345", "#1234567", "#gggggg", "blue", "rgb(0,0,0)", "##0069a8"]) {
      expect(parseHex(input)).toBeNull();
    }
  });

  it("stores only exact #rrggbb, as web-api validates", () => {
    expect(isHexColour("#0069a8")).toBe(true);
    expect(isHexColour("#0069A8")).toBe(true);
    expect(isHexColour("0069a8")).toBe(false);
    expect(isHexColour("#06a")).toBe(false);
    expect(isHexColour(42)).toBe(false);
  });

  it("round-trips through RGB and HSV", () => {
    for (const hex of ["#0069a8", "#fbbf24", "#1e1b4b", "#000000", "#ffffff", "#808080", "#c084fc"]) {
      expect(rgbToHex(hexToRgb(hex))).toBe(hex);
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });

  it("reads pure hues at the HSV edges", () => {
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe("#ff0000");
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe("#00ff00");
    expect(hsvToHex({ h: 240, s: 1, v: 1 })).toBe("#0000ff");
    expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe("#ff0000");
    expect(hsvToHex({ h: 200, s: 0, v: 0 })).toBe("#000000");
  });
});

describe("contrast", () => {
  it("follows WCAG's ratio", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#0069a8", "#0069a8")).toBe(1);
    expect(contrastRatio("#0069a8", "#ffffff")).toBeCloseTo(5.86, 2);
    expect(contrastRatio("#ffffff", "#0069a8")).toBe(contrastRatio("#0069a8", "#ffffff"));
  });

  it("picks the website's text colour on an accent", () => {
    expect(readableForegroundForAccent("#0069a8")).toBe("#ffffff");
    expect(readableForegroundForAccent("#0078b8")).toBe("#ffffff");
    expect(readableForegroundForAccent("#1e1b4b")).toBe("#ffffff");
    expect(readableForegroundForAccent("#fbbf24")).toBe("#0b0b0b");
    expect(readableForegroundForAccent("#60a5fa")).toBe("#0b0b0b");
    expect(readableForegroundForAccent("#ffffff")).toBe("#0b0b0b");
  });

  // Near-black #0b0b0b (not #000) caps the worst case, a mid-tone, at about 4.44:1.
  it("keeps text on any accent at about 4.4:1 or better", () => {
    for (let channel = 0; channel <= 255; channel += 15) {
      for (const hex of [rgbToHex({ r: channel, g: channel, b: channel }), rgbToHex({ r: 255 - channel, g: channel, b: 128 }), rgbToHex({ r: 0, g: channel, b: 255 - channel })]) {
        expect(contrastRatio(hex, readableForegroundForAccent(hex))).toBeGreaterThanOrEqual(4.4);
      }
    }
  });
});

describe("OKLCH", () => {
  it("parses the website's notations", () => {
    expect(parseOklch("oklch(0.5 0.134 242.749)")).toEqual({ l: 0.5, c: 0.134, h: 242.749, alpha: 1 });
    expect(parseOklch("oklch(98.4% 0.003 247.858)")).toMatchObject({ c: 0.003, h: 247.858, alpha: 1 });
    expect(parseOklch("oklch(98.4% 0.003 247.858)")?.l).toBeCloseTo(0.984, 10);
    expect(parseOklch("oklch(1 0 0 / 10%)")).toEqual({ l: 1, c: 0, h: 0, alpha: 0.1 });
    expect(parseOklch("oklch(0.34 0.028 250 / 0.55)")?.alpha).toBe(0.55);
    expect(parseOklch("#ffffff")).toBeNull();
  });

  it("converts to the hex the website renders", () => {
    expect(toHex("oklch(0.5 0.134 242.749)")).toBe("#0069a8");
    expect(toHex("oklch(0.443 0.11 240.79)")).toBe("#00598a");
    expect(toHex("oklch(1 0 0)")).toBe("#ffffff");
    expect(toHex("oklch(0.145 0 0)")).toBe("#0a0a0a");
    expect(toHex("oklch(0.205 0 0)")).toBe("#171717");
    expect(toHex("#0069A8")).toBe("#0069a8");
    expect(alphaOf("oklch(1 0 0 / 10%)")).toBe(0.1);
    expect(alphaOf("#ffffff")).toBe(1);
  });

  it("mixes like color-mix(in oklch, …)", () => {
    expect(mixOklch("#0069a8", "#ffffff", 1)).toBe("#0069a8");
    expect(mixOklch("#0069a8", "#ffffff", 0)).toBe("#ffffff");
    // A grey has no hue, so the mix keeps the accent's: no detour through other hues.
    const half = mixOklch("#0069a8", "#ffffff", 0.5);
    const { r, g, b } = hexToRgb(half);
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
  });

  it("composites translucent borders onto a surface", () => {
    expect(composite("#ffffff", "#000000", 0.1)).toBe("#1a1a1a");
    expect(composite("#ffffff", "#171717", 0)).toBe("#171717");
    expect(composite("#ffffff", "#171717", 1)).toBe("#ffffff");
  });
});

describe("readableOn", () => {
  it("keeps an accent that already passes", () => {
    expect(readableOn("#0069a8", ["#ffffff"], 4.5, "darker")).toBe("#0069a8");
  });

  it("moves lightness just far enough to pass on every surface", () => {
    const surfaces = ["#0a0a0a", "#171717"];
    const lifted = readableOn("#0078b8", surfaces, 7, "lighter");
    for (const surface of surfaces) expect(contrastRatio(lifted, surface)).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(lifted, "#171717")).toBeLessThan(7.3);
    const darkened = readableOn("#fbbf24", ["#ffffff"], 4.5, "darker");
    expect(contrastRatio(darkened, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});
