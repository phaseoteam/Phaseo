import { memo, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { ChatMessage } from "@shared/types";

interface ChatPaneProps {
  messages: ChatMessage[];
  isSending: boolean;
  onSend: (content: string) => Promise<void>;
}

export const ChatPane = memo(function ChatPane({ messages, isSending, onSend }: ChatPaneProps) {
  const [draft, setDraft] = useState("");

  const canSend = draft.trim().length > 0 && !isSending;
  const orderedMessages = useMemo(() => messages, [messages]);

  const submit = async (): Promise<void> => {
    if (!canSend) {
      return;
    }

    const content = draft.trim();
    setDraft("");
    await onSend(content);
  };

  return (
    <section className="chat-pane">
      <div className="pane-header">
        <h2>Chat Mode</h2>
        <span>{isSending ? "Thinking..." : "Ready"}</span>
      </div>

      <div className="message-list">
        {orderedMessages.map((message) => (
          <article key={message.id} className={`message message-${message.role}`}>
            <header>
              <strong>{message.role === "assistant" ? "Assistant" : message.role === "user" ? "You" : "System"}</strong>
              <span>{message.status ?? "done"}</span>
            </header>
            {message.role === "assistant" ? (
              <div className="markdown">
                <ReactMarkdown>{message.content || "..."}</ReactMarkdown>
              </div>
            ) : (
              <p>{message.content || "..."}</p>
            )}
          </article>
        ))}
      </div>

      <div className="composer">
        <textarea
          value={draft}
          placeholder="Ask for anything, or switch to Code mode for repo actions..."
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <button type="button" className="primary-button" disabled={!canSend} onClick={() => void submit()}>
          Send
        </button>
      </div>
    </section>
  );
});
