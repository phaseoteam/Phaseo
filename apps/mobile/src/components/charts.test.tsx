import { act } from "react";
import { createRoot, type Root, type TestInstance } from "test-renderer";
import { LineChart, type LineSeries } from "./charts";

// Worklets, gestures and SVG don't run under Jest, so each piece the chart uses is a plain stand-in. The reading is
// chosen through the screen-reader step action, which goes through the same `active` state a drag does.
jest.mock("react-native-reanimated", () => {
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  const sharedValue = (initial: unknown) => {
    let value = initial;
    return { get: () => value, set: (next: unknown) => { value = next; } };
  };
  return {
    __esModule: true,
    default: { View },
    FadeIn: { duration: () => undefined },
    useSharedValue: sharedValue,
    useAnimatedStyle: (style: () => object) => style(),
  };
});
jest.mock("react-native-gesture-handler", () => ({
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  usePanGesture: () => ({}),
}));
jest.mock("react-native-worklets", () => ({ scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args) }));
jest.mock("react-native-svg", () => {
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return { __esModule: true, default: View, Circle: View, G: View, Line: View, Path: View, Rect: View, Text: View };
});
jest.mock("@/components/ui", () => {
  const { createElement } = jest.requireActual<typeof import("react")>("react");
  return {
    Text: ({ children }: { children?: React.ReactNode }) => createElement("Text", null, children),
    useToneColor: () => "#000",
  };
});
jest.mock("@/lib/haptics", () => ({ haptic: jest.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
beforeEach(() => { root = createRoot(); });
afterEach(() => act(() => root.unmount()));

const series = (count: number): LineSeries[] => [{
  key: "price",
  colour: "#000",
  label: "Price",
  points: Array.from({ length: count }, (_, index) => ({ x: 1_000 * (index + 1), y: index + 1 })),
}];
/** Like the pricing chart's: formatting a timestamp that isn't there throws. */
const title = (x: number) => {
  if (x === undefined) throw new Error("read a point that isn't there");
  return `t${x}`;
};
const chart = (count: number) => <LineChart series={series(count)} tooltipTitle={title} />;
const surface = () => {
  const [found] = root.container.queryAll((node: TestInstance) => node.props.accessibilityRole === "adjustable");
  if (!found) throw new Error("No interactive chart rendered");
  return found;
};
const step = (actionName: "increment" | "decrement") =>
  act(() => surface().props.onAccessibilityAction({ nativeEvent: { actionName } }));

describe("LineChart readings", () => {
  it("reads the chosen point", async () => {
    await act(() => root.render(chart(5)));
    await step("decrement");
    expect(surface().props.accessibilityValue).toEqual({ text: "t5000, Price 5" });
  });

  it("drops a reading past the end when the series gets shorter, without describing a missing point", async () => {
    await act(() => root.render(chart(5)));
    await step("decrement");
    expect(surface().props.accessibilityValue).toEqual({ text: "t5000, Price 5" });
    await act(() => root.render(chart(2)));
    expect(surface().props.accessibilityValue).toBeUndefined();
    // The next step starts again from the new series' end.
    await step("decrement");
    expect(surface().props.accessibilityValue).toEqual({ text: "t2000, Price 2" });
  });
});
