import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { act } from "react";
import { createRoot, type Root } from "test-renderer";
import { EnrichedMarkdownText } from "react-native-enriched-markdown";
import { chipFromLinkUrl } from "@phaseo/app-kit/message-chips-markdown";
import { toast } from "@/components/ui/overlayStore";
import { haptic } from "@/lib/haptics";
import { Markdown } from "./Markdown";

jest.mock("react-native-enriched-markdown", () => ({ EnrichedMarkdownText: jest.fn(() => null) }));
jest.mock("uniwind", () => ({ useCSSVariable: () => ["#fafafa", "#aaa", "#333", "#222", "#0084d1"] }));
jest.mock("@/perf", () => ({ perf: null }));
jest.mock("expo-linking", () => ({ openURL: jest.fn() }));
jest.mock("expo-clipboard", () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
jest.mock("@/lib/haptics", () => ({ haptic: jest.fn() }));
jest.mock("@/components/ui/overlayStore", () => ({ toast: jest.fn() }));

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

const reply = "Edit src/app/page.tsx on feat/chips at a1b2c3d, then open http://localhost:3000. Claude Fable 5.2, #ff8800 and `npm test` stay.";
const lastProps = () => jest.mocked(EnrichedMarkdownText).mock.calls.at(-1)![0];
const chipLinks = (markdown: string) => [...markdown.matchAll(/\]\((phaseo-chip:[^)]+)\)/g)].map((match) => chipFromLinkUrl(match[1]!));
const press = (url: string) => act(() => lastProps().onLinkPress!({ url } as never));

test("with chips on, paths, branches, commits and local servers become chip links styled as tinted body text", async () => {
  await act(() => root.render(<Markdown text={reply} chips />));
  const { markdown, markdownStyle } = lastProps();
  expect(chipLinks(markdown)).toEqual([
    { kind: "file", path: "src/app/page.tsx" },
    { kind: "branch", name: "feat/chips" },
    { kind: "commit", sha: "a1b2c3d" },
    { kind: "local", href: "http://localhost:3000" },
  ]);
  expect(markdown).toContain("[page.tsx](phaseo-chip:file:");
  expect(markdown).toContain("Claude Fable 5.2, #ff8800 and `npm test` stay.");
  expect(markdownStyle?.linkVariants).toEqual({ "^phaseo-chip:": { color: "#fafafa", backgroundColor: "#fafafa14", underline: false, fontFamily: "Montserrat" } });
});

test("without chips (user text, other screens) the markdown is unchanged", async () => {
  await act(() => root.render(<Markdown text={reply} />));
  expect(lastProps().markdown).not.toContain("phaseo-chip:");
  expect(lastProps().markdown).toContain("src/app/page.tsx on feat/chips");
});

test("pressing a chip opens links and copies the rest", async () => {
  await act(() => root.render(<Markdown text={`${reply} Also https://example.com/a.`} chips />));
  const urls = [...lastProps().markdown.matchAll(/\]\((phaseo-chip:[^)]+)\)/g)].map((match) => match[1]!);
  const url = (kind: string) => urls.find((entry) => entry.startsWith(`phaseo-chip:${kind}:`))!;

  await press(url("link"));
  expect(Linking.openURL).toHaveBeenLastCalledWith("https://example.com/a");
  expect(Clipboard.setStringAsync).not.toHaveBeenCalled();

  await press(url("file"));
  expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith("src/app/page.tsx");
  expect(toast).toHaveBeenLastCalledWith("Copied the path.", { tone: "success" });
  await press(url("branch"));
  expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith("feat/chips");
  await press(url("commit"));
  expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith("a1b2c3d");
  // The local server runs on the computer, so its address is copied rather than opened.
  await press(url("local"));
  expect(Clipboard.setStringAsync).toHaveBeenLastCalledWith("http://localhost:3000");
  expect(Linking.openURL).toHaveBeenCalledTimes(1);
  expect(haptic).toHaveBeenCalledWith("success");
});

test("ordinary links keep the scheme check", async () => {
  await act(() => root.render(<Markdown text="[a](https://example.com) [b](tel:123)" chips />));
  await press("https://example.com");
  await press("tel:123");
  expect(Linking.openURL).toHaveBeenCalledTimes(1);
  expect(Linking.openURL).toHaveBeenCalledWith("https://example.com");
});
