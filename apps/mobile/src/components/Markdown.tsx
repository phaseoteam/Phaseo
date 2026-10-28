import * as Linking from "expo-linking";
import { memo, useMemo } from "react";
import { EnrichedMarkdownText, type MarkdownStyle } from "react-native-enriched-markdown";
import { useCSSVariable } from "uniwind";

/** Native markdown (GitHub flavour, for tables) styled with the app's tokens. */
export const Markdown = memo(function Markdown({ text, streaming }: { text: string; streaming?: boolean }) {
  const [foreground, muted, border, accent, primary] = useCSSVariable(["--color-foreground", "--color-muted-foreground", "--color-border", "--color-muted", "--color-primary"]).map((value) => String(value ?? ""));
  const style = useMemo<MarkdownStyle>(() => {
    const body = { fontFamily: "Montserrat", fontSize: 15, lineHeight: 23, color: foreground };
    return {
      paragraph: { ...body, marginBottom: 10 },
      h1: { ...body, fontSize: 22, lineHeight: 29, fontWeight: "700", marginTop: 8, marginBottom: 8 },
      h2: { ...body, fontSize: 19, lineHeight: 26, fontWeight: "700", marginTop: 8, marginBottom: 6 },
      h3: { ...body, fontSize: 17, lineHeight: 24, fontWeight: "600", marginTop: 6, marginBottom: 4 },
      strong: { fontFamily: "Montserrat", fontWeight: "bold" },
      list: { ...body, bulletColor: muted, markerColor: muted, marginBottom: 10 },
      blockquote: { ...body, color: muted, borderColor: border, borderWidth: 3, gapWidth: 10, marginBottom: 10 },
      link: { color: primary, underline: true },
      code: { fontSize: 13, color: foreground, backgroundColor: accent },
      codeBlock: { fontSize: 13, lineHeight: 19, color: foreground, backgroundColor: accent, borderRadius: 8, padding: 12, marginBottom: 10 },
      table: { ...body, fontSize: 14, headerBackgroundColor: accent, headerTextColor: foreground, borderColor: border, marginBottom: 10 },
      thematicBreak: { color: border },
    } as MarkdownStyle;
  }, [foreground, muted, border, accent, primary]);
  return (
    <EnrichedMarkdownText
      markdown={text}
      markdownStyle={style}
      flavor="github"
      streamingAnimation={streaming}
      selectable
      onLinkPress={({ url }) => void Linking.openURL(url)}
    />
  );
});
