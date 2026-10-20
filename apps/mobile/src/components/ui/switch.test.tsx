import { act, useState } from "react";
import { createRoot, type Root, type TestInstance } from "test-renderer";
import { Switch, SWITCH_SIZES, switchHitSlop } from "./switch";

// Reanimated's worklets don't run under Jest (and its own mock pulls in FlatList, which this preset can't resolve),
// so the four pieces the switch uses are stubbed to apply values at once.
jest.mock("react-native-reanimated", () => {
  const { View } = jest.requireActual<typeof import("react-native")>("react-native");
  return {
    __esModule: true,
    default: { View },
    ReduceMotion: { System: "system" },
    useSharedValue: (value: number) => ({ value }),
    useAnimatedStyle: (style: () => object) => style(),
    withTiming: jest.fn((value: number) => value),
  };
});
jest.mock("expo-haptics", () => ({ selectionAsync: jest.fn(() => Promise.resolve()) }));
const haptics = jest.requireMock<{ selectionAsync: jest.Mock }>("expo-haptics");
const reanimated = jest.requireMock<{ withTiming: jest.Mock }>("react-native-reanimated");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
beforeEach(() => {
  haptics.selectionAsync.mockClear();
  root = createRoot();
});
afterEach(() => act(() => root.unmount()));

const render = (element: React.ReactElement) => act(() => root.render(element));
const control = () => {
  const [found] = root.container.queryAll((node) => node.props.accessibilityRole === "switch");
  if (!found) throw new Error("No switch rendered");
  return found;
};
/** A tap as screen readers and keyboards send it (Pressability's onClick). */
const tap = (node: TestInstance) => act(() => node.props.onClick({ nativeEvent: {}, currentTarget: node, target: node, stopPropagation() {} }));

describe("Switch", () => {
  it("is a labelled switch that reports its state", async () => {
    await render(<Switch value={false} accessibilityLabel="Reasoning" />);
    expect(control().props.accessibilityLabel).toBe("Reasoning");
    expect(control().props.accessibilityState).toEqual({ checked: false, disabled: false });
    await render(<Switch value accessibilityLabel="Reasoning" />);
    expect(control().props.accessibilityState).toEqual({ checked: true, disabled: false });
  });

  it("asks for the opposite value with a haptic tick", async () => {
    const onValueChange = jest.fn();
    await render(<Switch value={false} onValueChange={onValueChange} />);
    await tap(control());
    expect(onValueChange).toHaveBeenCalledWith(true);
    expect(haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it("toggles back and forth when its owner keeps the value", async () => {
    function Owner() {
      const [on, setOn] = useState(false);
      return <Switch value={on} onValueChange={setOn} accessibilityLabel="Only free models" />;
    }
    await render(<Owner />);
    await tap(control());
    expect(control().props.accessibilityState.checked).toBe(true);
    await tap(control());
    expect(control().props.accessibilityState.checked).toBe(false);
  });

  it("slides the thumb in 150 ms and follows the system's reduced motion setting", async () => {
    reanimated.withTiming.mockClear();
    await render(<Switch value={false} />);
    await render(<Switch value />);
    expect(reanimated.withTiming).toHaveBeenLastCalledWith(1, { duration: 150, reduceMotion: "system" });
  });

  it("ignores taps when disabled and says so", async () => {
    const onValueChange = jest.fn();
    await render(<Switch value onValueChange={onValueChange} disabled accessibilityLabel="Notifications" />);
    expect(control().props.accessibilityState).toEqual({ checked: true, disabled: true });
    await tap(control());
    expect(onValueChange).not.toHaveBeenCalled();
    expect(haptics.selectionAsync).not.toHaveBeenCalled();
    expect(control().props.className).toContain("opacity-50");
  });

  it("uses the website's track sizes and fill colours", async () => {
    await render(<Switch value={false} />);
    expect(control().props.className).toContain("h-5 w-8");
    const classes = root.container.queryAll((node) => typeof node.props.className === "string").map((node) => node.props.className as string);
    expect(classes).toEqual(expect.arrayContaining([expect.stringContaining("bg-input/90"), expect.stringContaining("bg-primary"), expect.stringContaining("size-4 dark:bg-foreground")]));
    await render(<Switch value size="sm" />);
    expect(control().props.className).toContain("h-4 w-6");
    expect(root.container.queryAll((node) => String(node.props.className).includes("size-3 dark:bg-primary-foreground"))).toHaveLength(1);
  });

  it("can be hidden from screen readers when its row is the control", async () => {
    await render(<Switch value={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />);
    expect(control().props.importantForAccessibility).toBe("no-hide-descendants");
  });
});

describe("switchHitSlop", () => {
  it("grows both sizes to at least a 44 point target", () => {
    for (const size of ["default", "sm"] as const) {
      const slop = switchHitSlop(size);
      expect(SWITCH_SIZES[size].width + slop.left + slop.right).toBeGreaterThanOrEqual(44);
      expect(SWITCH_SIZES[size].height + slop.top + slop.bottom).toBeGreaterThanOrEqual(44);
    }
  });

  it("moves the thumb the track's inner width less the thumb, as on the web", () => {
    expect(SWITCH_SIZES.default.travel).toBe(SWITCH_SIZES.default.width - 4 - 16);
    expect(SWITCH_SIZES.sm.travel).toBe(SWITCH_SIZES.sm.width - 4 - 12);
  });
});
