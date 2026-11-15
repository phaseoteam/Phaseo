import { INLINE_CHIP_TONES } from "@phaseo/app-kit/ui-recipes";
import { act } from "react";
import { createRoot, type Root } from "test-renderer";
import { InlineChip, MentionText } from "./inline-chip";

// Uniwind resolves colours from the compiled stylesheet, which Jest doesn't have.
jest.mock("uniwind", () => ({ useCSSVariable: () => "#888888" }));
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
const chips = () => root.container.queryAll((node) => typeof node.props.accessibilityLabel === "string");
const textOf = (node: { children: unknown[] }): string =>
  node.children.map((child) => (typeof child === "string" ? child : textOf(child as { children: unknown[] }))).join("");

describe("InlineChip", () => {
  it("draws the shared recipe for each tone", async () => {
    await render(<InlineChip label="usage.ts" />);
    expect(chips()[0]?.props.className).toContain(INLINE_CHIP_TONES.default.surface);
    await render(<InlineChip label="usage.ts" tone="inverse" />);
    expect(chips()[0]?.props.className).toContain(INLINE_CHIP_TONES.inverse.surface);
  });
});

describe("MentionText", () => {
  it("draws tokens as chips and keeps the text around them", async () => {
    await render(<MentionText text="Compare with @[Pricing plan](chat:t1) and @[usage.ts](file:src%2Fusage.ts) please" tone="inverse" />);
    expect(chips().map((chip) => chip.props.accessibilityLabel)).toEqual(["Pricing plan, chat", "usage.ts, file"]);
    expect(textOf(root.container as unknown as { children: unknown[] })).toBe("Compare with Pricing plan and usage.ts please");
  });

  it("leaves text without tokens alone", async () => {
    await render(<MentionText text="Just text, me@example.com" />);
    expect(chips()).toHaveLength(0);
    expect(textOf(root.container as unknown as { children: unknown[] })).toBe("Just text, me@example.com");
  });
});
