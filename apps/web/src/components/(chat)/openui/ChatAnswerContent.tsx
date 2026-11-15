import dynamic from "@/lib/dynamic";
import { useTranslations } from "@/i18n/react";
import type { ComponentProps } from "react";
import { defaultRemarkPlugins, Streamdown, type StreamdownProps } from "streamdown";
import type { Chip } from "@phaseo/app-kit/message-chips";
import { parseChipAttribute, remarkMessageChips } from "@phaseo/app-kit/message-chips-remark";
import { chatMarkdownPlugins, normalizeChatMarkdown } from "../chatMarkdown";
import { MessageChip } from "../MessageChips";
import { getOpenUISource } from "./openuiHelpers";
import { disableOpenUIAutoDevtools } from "./loadOpenUI";
import type { ChatOpenUIRendererProps } from "./ChatOpenUIRenderer";

const OpenUIRenderer = dynamic(
  () => {
    disableOpenUIAutoDevtools();
    return import("./ChatOpenUIRenderer").then(
      (module) => module.ChatOpenUIRenderer,
    );
  },
  {
    ssr: false,
    loading: function LoadingInteractiveAnswer() {
      const t = useTranslations("Common.ui.openui");
      return (
      <p role="status" className="text-sm text-muted-foreground">
        {t("loading")}
      </p>
      );
    },
  },
);

type RemarkPlugins = NonNullable<StreamdownProps["remarkPlugins"]>;
type MarkdownNode = { type: string; value?: string; url?: string; children?: MarkdownNode[] };

/**
 * GFM turns a bare URL into a link whose text is the URL; those go back to text so the chips plugin reads
 * them as link and local server chips. Links written as `[text](url)` stay links.
 */
export function remarkBareLinksAsText() {
  const visit = (node: MarkdownNode) => {
    if (!node.children) return;
    node.children = node.children.map((child) => {
      const only = child.type === "link" && child.children?.length === 1 ? child.children[0] : undefined;
      if (only?.type === "text" && only.value === child.url && /^https?:\/\//i.test(only.value ?? "")) return { type: "text", value: only.value };
      if (child.type !== "code" && child.type !== "inlineCode") visit(child);
      return child;
    });
  };
  return (tree: MarkdownNode) => visit(tree);
}

// Streamdown's own remark plugins, in its order, with chips last. The math plugin (chatMarkdownPlugins) is
// appended by Streamdown after these; its syntax is parsed before any transform runs, so chips skip math.
// One list shared by every answer, so Streamdown's blocks keep their memo.
const answerRemarkPlugins: RemarkPlugins = [...Object.values(defaultRemarkPlugins), remarkBareLinksAsText, remarkMessageChips];
// Streamdown sanitizes the rendered HTML; chips keep their `data-chip` (hast property `dataChip`).
const answerAllowedTags: StreamdownProps["allowedTags"] = { span: ["dataChip"] };

/**
 * `data-chip` spans come from remarkMessageChips; other spans render unchanged. Raw HTML in an answer can
 * write the same attribute, so a chip is shown only when its fields are safe to put in a link or style.
 */
function AnswerSpan({ node: _node, ...props }: ComponentProps<"span"> & { node?: unknown }) {
  const { "data-chip": value, ...rest } = props as ComponentProps<"span"> & { "data-chip"?: unknown };
  const chip = parseChipAttribute(value);
  if (chip && safeChip(chip)) return <MessageChip chip={chip} />;
  return <span {...rest} />;
}

function safeChip(chip: Chip): boolean {
  const text = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 2048;
  switch (chip.kind) {
    case "link": case "local": return text(chip.href) && /^https?:\/\//i.test(chip.href);
    case "file": case "folder": return text(chip.path);
    case "chat": return text(chip.id) && typeof chip.label === "string";
    case "commit": return text(chip.sha);
    case "branch": return text(chip.name);
    default: return false;
  }
}
const answerComponents: StreamdownProps["components"] = { span: AnswerSpan };

/** An assistant answer's Markdown, with reply chips for paths, links, commits, branches and local servers. */
export function ChatAnswerMarkdown({ content }: { content: string }) {
  return (
    <Streamdown plugins={chatMarkdownPlugins} remarkPlugins={answerRemarkPlugins} components={answerComponents} allowedTags={answerAllowedTags}>
      {normalizeChatMarkdown(content)}
    </Streamdown>
  );
}

export function ChatAnswerContent({
  content,
  interactive = false,
  ...props
}: Omit<ChatOpenUIRendererProps, "source"> & {
  content: string;
  interactive?: boolean;
}) {
  const source = interactive ? getOpenUISource(content) : null;
  if (source) return <OpenUIRenderer source={source} {...props} />;
  // Hold a partial root prefix while tokens arrive, rather than flash raw syntax.
  if (
    interactive &&
    props.isStreaming &&
    /^\s*(?:r|ro|roo|root\s*)$/.test(content)
  )
    return null;
  return <ChatAnswerMarkdown content={content} />;
}
