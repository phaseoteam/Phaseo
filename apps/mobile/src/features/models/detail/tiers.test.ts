import { PROVIDER_PALETTE, providerSeriesColour, serviceTierBadgeStyle, serviceTierLabel, tierDashArray } from "./tiers";

describe("service tier badges", () => {
  test("each tier has the website's background and text colours", () => {
    expect(serviceTierBadgeStyle("batch")).toEqual({ label: "Batch", tier: "batch", background: "bg-orange-100 dark:bg-orange-950", text: "text-orange-600 dark:text-orange-400" });
    expect(serviceTierBadgeStyle("flex")).toMatchObject({ label: "Flex", background: "bg-sky-100 dark:bg-sky-950", text: "text-sky-600 dark:text-sky-400" });
    expect(serviceTierBadgeStyle("priority")).toMatchObject({ label: "Fast", background: "bg-violet-100 dark:bg-violet-950", text: "text-violet-600 dark:text-violet-400" });
    expect(serviceTierBadgeStyle("ultrafast")).toMatchObject({ label: "Ultrafast", background: "bg-fuchsia-100 dark:bg-fuchsia-950", text: "text-fuchsia-600 dark:text-fuchsia-400" });
    expect(serviceTierBadgeStyle("free")).toMatchObject({ label: "Free", background: "bg-emerald-100 dark:bg-emerald-950", text: "text-emerald-600 dark:text-emerald-400" });
  });

  test("fast draws as priority, standard has no badge, unknown tiers are neutral", () => {
    expect(serviceTierBadgeStyle("Fast")).toMatchObject({ label: "Fast", tier: "priority", background: "bg-violet-100 dark:bg-violet-950" });
    expect(serviceTierBadgeStyle("standard")).toBeNull();
    expect(serviceTierBadgeStyle("")).toBeNull();
    expect(serviceTierBadgeStyle("scale_tier")).toEqual({ label: "Scale Tier", tier: "scale_tier", background: "bg-muted", text: "text-muted-foreground" });
    expect(serviceTierLabel(null)).toBe("Standard");
  });
});

describe("price history lines", () => {
  test("tier dashes match the website's legend", () => {
    expect(tierDashArray("standard")).toBeUndefined();
    expect(tierDashArray("Batch")).toBe("16 4");
    expect(tierDashArray("priority")).toBe("8 4");
    expect(tierDashArray("flex")).toBe("10 3 2 3");
    expect(tierDashArray("free")).toBe("1 5");
    expect(tierDashArray("ultrafast")).toBe("6 4");
  });

  test("providers without a brand colour take the website's palette in order, then golden-angle hues", () => {
    expect(providerSeriesColour(0)).toBe("#ff6f4a");
    expect(providerSeriesColour(7)).toBe(PROVIDER_PALETTE[7]);
    expect(providerSeriesColour(8)).toMatch(/^#[0-9a-f]{6}$/);
    expect(providerSeriesColour(8)).not.toBe(providerSeriesColour(9));
  });
});
