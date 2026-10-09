"use client";

import dynamic from "next/dynamic";
import { Streamdown } from "streamdown";
import { chatMarkdownPlugins, normalizeChatMarkdown } from "../chatMarkdown";
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
    loading: () => (
      <p role="status" className="text-sm text-muted-foreground">
        Loading interactive answer…
      </p>
    ),
  },
);

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
  return (
    <Streamdown plugins={chatMarkdownPlugins}>
      {normalizeChatMarkdown(content)}
    </Streamdown>
  );
}
