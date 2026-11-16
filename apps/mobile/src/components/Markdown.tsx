import * as Linking from "expo-linking";
import { memo, useMemo } from "react";
import { EnrichedMarkdownText, type MarkdownStyle } from "react-native-enriched-markdown";
import { useCSSVariable } from "uniwind";
import { copyWithNotice } from "@/lib/clipboard";
import { toHex } from "@/lib/theme/colour";
import { perf } from "@/perf";
import { isOpenableMarkdownLink } from "./markdownLinks";
import { normalizeChatMarkdown } from "@phaseo/app-kit/markdown-math";
import { chipCopyText, chipHref, CHIP_KIND_NAMES, type Chip } from "@phaseo/app-kit/message-chips";
import { chipFromLinkUrl, chipMarkdown } from "@phaseo/app-kit/message-chips-markdown";

const md4cFlags = { latexMath: true };
// The embedded chip's `bg-foreground/6`, a touch stronger (8%) since a phone has no hover or icon to mark it.
const CHIP_TINT_ALPHA = "14";
// What the copy toast names, where the chip's kind isn't what was copied.
const COPIED_NAMES: Partial<Record<Chip["kind"], string>> = { file: "path", folder: "path", chat: "chat name", local: "address" };

/** A chip pressed in an answer: links open; everything else is copied. */
export function pressChip(chip: Chip) {
  const href = chip.kind === "link" ? chipHref(chip) : undefined;
  if (href) {
    if (isOpenableMarkdownLink(href)) void Linking.openURL(href);
    return;
  }
  // A local server runs on the computer, not the phone, so its address is copied.
  copyWithNotice(chipCopyText(chip), COPIED_NAMES[chip.kind] ?? CHIP_KIND_NAMES[chip.kind]);
}

function pressLink(url: string) {
  const chip = chipFromLinkUrl(url);
  if (chip) pressChip(chip);
  else if (isOpenableMarkdownLink(url)) void Linking.openURL(url);
}

/**
 * Native markdown (GitHub flavour, for tables) styled with the app's tokens. With `chips` (model answers only), paths,
 * links, commits, branches and local servers become tinted links (see `@phaseo/app-kit/message-chips-markdown`).
 */
export const Markdown = memo(function Markdown({ text, streaming, chips }: { text: string; streaming?: boolean; chips?: boolean }) {
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
      // Reply chips: body text on a faint tint of it. Uniwind gives hex on native, the theme store may give OKLCH; both become #rrggbbaa.
      linkVariants: { "^phaseo-chip:": { color: foreground, backgroundColor: `${toHex(foreground ?? "")}${CHIP_TINT_ALPHA}`, underline: false, fontFamily: "Montserrat" } },
      code: { fontSize: 13, color: foreground, backgroundColor: accent },
      codeBlock: { fontSize: 13, lineHeight: 19, color: foreground, backgroundColor: accent, borderRadius: 8, padding: 12, marginBottom: 10 },
      table: { ...body, fontSize: 13, lineHeight: 18, headerBackgroundColor: accent, headerTextColor: foreground, borderColor: border, marginBottom: 10 },
      thematicBreak: { color: border },
      math: { fontSize: 16, color: foreground, backgroundColor: accent, marginTop: 8, marginBottom: 10 },
      inlineMath: { color: foreground },
    } as MarkdownStyle;
  }, [foreground, muted, border, accent, primary]);
  const markdown = useMemo(() => {
    const normalised = normalizeChatMarkdown(text);
    return chips ? chipMarkdown(normalised) : normalised;
  }, [text, chips]);
  return (
    <EnrichedMarkdownText
      markdown={markdown}
      markdownStyle={style}
      flavor="github"
      md4cFlags={md4cFlags}
      streamingAnimation={streaming}
      selectable
      // The native long-press preview would open links without the scheme check below.
      enableLinkPreview={false}
      onLinkPress={({ url }) => pressLink(url)}
    />
  );
});
