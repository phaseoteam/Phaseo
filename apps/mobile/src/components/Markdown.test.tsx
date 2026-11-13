import { act } from "react";
import { createRoot, type Root } from "test-renderer";
import { EnrichedMarkdownText } from "react-native-enriched-markdown";
import { Markdown } from "./Markdown";

jest.mock("react-native-enriched-markdown", () => ({ EnrichedMarkdownText: jest.fn(() => null) }));
jest.mock("uniwind", () => ({ useCSSVariable: () => ["#fafafa", "#aaa", "#333", "#222", "#0084d1"] }));
jest.mock("@/perf", () => ({ perf: null }));
jest.mock("expo-linking", () => ({ openURL: jest.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
beforeEach(() => { jest.clearAllMocks(); root = createRoot(); });
afterEach(() => act(() => root.unmount()));

test("native math is enabled, themed, and keeps currency and code literal", async () => {
  await act(() => root.render(<Markdown text={"Half $\\frac{1}{2}$; $5 and $10; `$x$`"} />));
  const props = jest.mocked(EnrichedMarkdownText).mock.calls.at(-1)![0];
  expect(props.md4cFlags).toEqual({ latexMath: true });
  expect(props.markdown).toContain("\\$5 and \\$10");
  expect(props.markdown).toContain(String.raw`$\frac{1}{2}$`);
  expect(props.markdownStyle).toMatchObject({ math: { color: "#fafafa", backgroundColor: "#222" }, inlineMath: { color: "#fafafa" } });
  expect(props.enableLinkPreview).toBe(false);
});

test("streaming code stays literal and a completed equation is passed to the native engine", async () => {
  await act(() => root.render(<Markdown text={"```text\n$80%$"} streaming />));
  expect(jest.mocked(EnrichedMarkdownText).mock.calls.at(-1)![0].markdown).toBe("```text\n$80%$");
  await act(() => root.render(<Markdown text={"$$x = 80%$$"} />));
  expect(jest.mocked(EnrichedMarkdownText).mock.calls.at(-1)![0].markdown).toBe("$$\nx = 80\\%\n$$");
});
