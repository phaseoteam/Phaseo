import { act } from "react";
import { createRoot, type Root, type TestInstance } from "test-renderer";
import { modelLabel } from "@/features/chat/modelSheetRows";
import { ComposerModelControl } from "./ComposerControls";

// The UI kit pulls in styling and a Text renderer this Jest preset can't load, so host elements stand in.
jest.mock("@/components/ui", () => {
  const { createElement } = jest.requireActual<typeof import("react")>("react");
  return {
    Icon: () => null,
    Text: ({ children }: { children?: React.ReactNode }) => createElement("Text", null, children),
    measureAnchor: async () => null,
    showActions: () => {},
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
beforeEach(() => { root = createRoot(); });
afterEach(() => act(() => root.unmount()));

const render = (element: React.ReactElement) => act(() => root.render(element));
const texts = () => root.container.queryAll((node) => typeof node.props.children === "string").map((node) => node.props.children as string);
const labelled = () => {
  const [found] = root.container.queryAll((node: TestInstance) => typeof node.props.accessibilityLabel === "string" && node.props.accessibilityLabel.startsWith("Model and effort"));
  if (!found) throw new Error("No model control rendered");
  return found;
};

describe("the composer's model control", () => {
  it("names the model and its effort beside one line of text, not just its logo", () => {
    render(<ComposerModelControl label={modelLabel("Claude Opus 5.5", "Medium")} onPress={() => {}} hint="Choose the model, its effort and the mode" />);
    expect(texts()).toEqual(expect.arrayContaining(["Claude Opus 5.5", "Medium"]));
    expect(labelled().props.accessibilityRole).toBe("button");
    expect(labelled().props.accessibilityHint).toBe("Choose the model, its effort and the mode");
  });

  it("says why it can't be changed when the computer won't let the phone change it", () => {
    render(<ComposerModelControl label={modelLabel("GPT-6.1", null)} readOnlyReason="Change it on the computer. Permissions: Ask first" />);
    expect(labelled().props.accessibilityRole).toBeUndefined();
    expect(labelled().props.accessibilityLabel).toBe("Model and effort, GPT-6.1. Change it on the computer. Permissions: Ask first");
  });
});
