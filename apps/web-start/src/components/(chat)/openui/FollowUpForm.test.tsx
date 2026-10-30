import { FollowUpForm } from "./openuiLibrary";

let mockSubmit: (prompt: string) => boolean | Promise<boolean>;
const mockSetSubmitted = jest.fn();
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  useContext: () => ({ disabled: false, onSubmit: mockSubmit }),
  useRef: () => ({ current: false }),
  useState: () => [false, mockSetSubmitted],
  useId: () => "follow-up-test",
}));
jest.mock("@openuidev/react-lang", () => ({
  ...jest.requireActual("@openuidev/react-lang"),
  useStateField: () => ({ value: "Cost", setValue: jest.fn() }),
  useIsStreaming: () => false,
}));

function mount(onSubmit: typeof mockSubmit) {
  mockSubmit = onSubmit;
  mockSetSubmitted.mockClear();
  const form = FollowUpForm({ question: "What matters?", fieldName: "priority", placeholder: "Priority", buttonLabel: "Continue" });
  return () => form.props.onSubmit({ preventDefault: jest.fn() });
}

it("blocks repeated events synchronously and stays locked after acceptance", async () => {
  let accept!: (value: boolean) => void;
  const onSubmit = jest.fn(() => new Promise<boolean>((resolve) => { accept = resolve; }));
  const submit = mount(onSubmit);
  const first = submit();
  await submit();
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(onSubmit).toHaveBeenCalledWith("What matters?\nCost");
  expect(mockSetSubmitted).toHaveBeenCalledWith(true);
  accept(true);
  await first;
  await submit();
  expect(onSubmit).toHaveBeenCalledTimes(1);
  expect(mockSetSubmitted).not.toHaveBeenCalledWith(false);
});

it.each([false, "throw"])("unlocks after rejection (%s)", async (outcome) => {
  const onSubmit = jest.fn(async () => { if (outcome === "throw") throw new Error("Rejected"); return false; });
  const submit = mount(onSubmit);
  await submit();
  expect(mockSetSubmitted).toHaveBeenLastCalledWith(false);
  await submit();
  expect(onSubmit).toHaveBeenCalledTimes(2);
});
