import { BADGE_TONES, CALLOUT_TONE_NAMES, CALLOUT_TONES } from "@phaseo/app-kit/ui-recipes";
import { act } from "react";
import { createRoot, type Root } from "test-renderer";
import { Callout } from "./callout";

// Uniwind ships untranspiled source and resolves classes from the compiled stylesheet, which Jest
// doesn't have, so the hook returns a known colour for the title classes.
jest.mock("uniwind", () => ({ useResolveClassNames: (className: string) => ({ color: className ? "#082f49" : undefined }) }));
// React Native's Text pulls in a renderer module this Jest preset can't resolve, so a host element stands in.
jest.mock("./text", () => {
  const { createElement } = jest.requireActual<typeof import("react")>("react");
  return { Text: ({ className, children }: { className?: string; children?: React.ReactNode }) => createElement("Text", { className }, children) };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
beforeEach(() => {
  root = createRoot();
});
afterEach(() => act(() => root.unmount()));

const render = (element: React.ReactElement) => act(() => root.render(element));
const classes = () => root.container.queryAll((node) => typeof node.props.className === "string").map((node) => node.props.className as string);
const box = () => {
  const [found] = root.container.queryAll((node) => String(node.props.className).includes("rounded-2xl"));
  if (!found) throw new Error("No callout rendered");
  return found;
};

describe("Callout", () => {
  it("draws each tone with the website's classes", async () => {
    for (const tone of CALLOUT_TONE_NAMES) {
      await render(<Callout tone={tone} title="Heads up">Body text</Callout>);
      expect(box().props.className).toContain(CALLOUT_TONES[tone].surface);
      expect(classes()).toEqual(expect.arrayContaining([
        expect.stringContaining(CALLOUT_TONES[tone].title),
        expect.stringContaining(CALLOUT_TONES[tone].description),
      ]));
    }
  });

  it("is the website's alert box, not a pill or a left-edge bar", async () => {
    await render(<Callout>Body text</Callout>);
    expect(box().props.className).toContain("rounded-2xl border px-4 py-3");
    expect(box().props.className).not.toMatch(/rounded-full|border-l-/);
  });

  it("colours the 16px icon like the title", async () => {
    await render(<Callout title="Heads up">Body text</Callout>);
    // Lucide draws an Svg host element sized and stroked from its props.
    const [icon] = root.container.queryAll((node) => node.props.width === 16 && node.props.height === 16);
    expect(icon?.props).toMatchObject({ stroke: "#082f49", strokeWidth: 2 });
  });

  it("leaves out the title when there isn't one and keeps other children as they are", async () => {
    await render(<Callout tone="warning"><Callout tone="info">Nested</Callout></Callout>);
    expect(classes().filter((name) => name.includes(CALLOUT_TONES.warning.title))).toHaveLength(0);
    expect(classes().filter((name) => name.includes("rounded-2xl"))).toHaveLength(2);
  });

  it("announces alerts and status changes but not static notes", async () => {
    await render(<Callout role="alert">Failed</Callout>);
    expect(box().props).toMatchObject({ accessibilityRole: "alert", accessibilityLiveRegion: "assertive" });
    await render(<Callout role="status">Saved</Callout>);
    expect(box().props).toMatchObject({ accessibilityLiveRegion: "polite" });
    await render(<Callout>Note</Callout>);
    expect(box().props.accessibilityRole).toBeUndefined();
    expect(box().props.accessibilityLiveRegion).toBeUndefined();
  });
});

describe("recipes", () => {
  it("only use classes Uniwind understands", () => {
    const all = [
      ...Object.values(CALLOUT_TONES).flatMap((tone) => Object.values(tone)),
      ...Object.values(BADGE_TONES).flatMap((tone) => Object.values(tone)),
    ].join(" ");
    expect(all).not.toMatch(/has-|\[&|color-mix|rounded-(full|lg|xl|2xl)/);
  });
});
