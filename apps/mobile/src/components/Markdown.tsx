import * as Linking from "expo-linking";
import { memo, useMemo } from "react";
import { EnrichedMarkdownText, type MarkdownStyle } from "react-native-enriched-markdown";
import { useCSSVariable } from "uniwind";
import { perf } from "@/perf";
import { isOpenableMarkdownLink } from "./markdownLinks";
import { normalizeChatMarkdown } from "@phaseo/app-kit/markdown-math";

const md4cFlags = { latexMath: true };

/** Native markdown (GitHub flavour, for tables) styled with the app's tokens. */
export const Markdown = memo(function Markdown({ text, streaming }: { text: string; streaming?: boolean }) {
  perf?.count("render.markdown");
  perf?.count("render.markdown.chars", text.length);
  const [foreground, muted, border, accent, primary] = useCSSVariable(["--color-foreground", "--color-muted-foreground", "--color-border", "--color-muted", "--color-primary"]).map((value) => String(value ?? ""));
  const style = useMemo<MarkdownStyle>(() => {
    // The type scale's body size with a looser line for reading; headings follow the scale (see TEXT_VARIANTS).
    const body = { fontFamily: "Montserrat", fontSize: 15, lineHeight: 23, color: foreground };
    return {
      paragraph: { ...body, marginBottom: 10 },
      h1: { ...body, fontSize: 20, lineHeight: 27, fontWeight: "700", marginTop: 8, marginBottom: 8 },
      h2: { ...body, fontSize: 18, lineHeight: 24, fontWeight: "700", marginTop: 8, marginBottom: 6 },
      h3: { ...body, fontSize: 16, lineHeight: 22, fontWeight: "600", marginTop: 6, marginBottom: 4 },
      strong: { fontFamily: "Montserrat", fontWeight: "bold" },
      list: { ...body, bulletColor: muted, markerColor: muted, marginBottom: 10 },
      blockquote: { ...body, color: muted, borderColor: border, borderWidth: 3, gapWidth: 10, marginBottom: 10 },
      link: { color: primary, underline: true },
      code: { fontSize: 13, color: foreground, backgroundColor: accent },
      codeBlock: { fontSize: 13, lineHeight: 19, color: foreground, backgroundColor: accent, borderRadius: 8, padding: 12, marginBottom: 10 },
      table: { ...body, fontSize: 13, lineHeight: 18, headerBackgroundColor: accent, headerTextColor: foreground, borderColor: border, marginBottom: 10 },
      thematicBreak: { color: border },
      math: { fontSize: 16, color: foreground, backgroundColor: accent, marginTop: 8, marginBottom: 10 },
      inlineMath: { color: foreground },
    } as MarkdownStyle;
  }, [foreground, muted, border, accent, primary]);
  return (
    <EnrichedMarkdownText
      markdown={normalizeChatMarkdown(text)}
      markdownStyle={style}
      flavor="github"
      md4cFlags={md4cFlags}
      streamingAnimation={streaming}
      selectable
      // The native long-press preview would open links without the scheme check below.
      enableLinkPreview={false}
      onLinkPress={({ url }) => {
        if (isOpenableMarkdownLink(url)) void Linking.openURL(url);
      }}
    />
  );
});
