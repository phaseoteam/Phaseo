import { startTransition, useEffect, useMemo, useState } from "react";
import type { AppSettings, ChatDoneEvent, ChatMessage, Session } from "@shared/types";
import { ChatPane } from "./components/ChatPane";
import { Sidebar } from "./components/Sidebar";

const EMPTY_SETTINGS: AppSettings = {
  providers: [
    {
      id: "provider-ai-stats-gateway",
      name: "AI Stats Gateway",
      kind: "openai-compatible",
      baseUrl: "https://api.phaseo.app/v1",
      apiKey: "",
      models: ["gpt-5-mini", "gpt-5"],
      defaultModel: "gpt-5-mini"
    }
  ],
  chatSelection: {
    providerId: "provider-ai-stats-gateway",
    model: "gpt-5-mini"
  },
  codeSelection: {
    providerId: "provider-ai-stats-gateway",
    model: "gpt-5-mini"
  },
  commandSafetyPrompt: true,
  theme: "system"
};

export function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messagesBySession, setMessagesBySession] = useState<Record<string, ChatMessage[]>>({});
  const [isSending, setIsSending] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(EMPTY_SETTINGS);

  useEffect(() => {
    const root = document.documentElement;

    if (settings.theme === "light") {
      root.setAttribute("data-theme", "light");
      return;
    }

    if (settings.theme === "dark") {
      root.setAttribute("data-theme", "dark");
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applySystemTheme = (): void => {
      root.setAttribute("data-theme", media.matches ? "dark" : "light");
    };

    applySystemTheme();
    media.addEventListener("change", applySystemTheme);
    return () => {
      media.removeEventListener("change", applySystemTheme);
    };
  }, [settings.theme]);

  useEffect(() => {
    void (async () => {
      try {
        if (!window.desktop) {
          throw new Error("Desktop bridge unavailable. Preload script failed to initialize.");
        }

        const data = await window.desktop.bootstrap();
        const chatSessions = data.sessions.filter((session) => session.mode === "chat");
        const preferredActiveId =
          data.activeSessionId && chatSessions.some((session) => session.id === data.activeSessionId)
            ? data.activeSessionId
            : chatSessions[0]?.id ?? null;

        setSessions(chatSessions);
        setSettings(data.settings);
        setActiveSessionId(preferredActiveId);

        if (preferredActiveId && preferredActiveId !== data.activeSessionId) {
          await window.desktop.setActiveSession(preferredActiveId);
        }
      } catch (error) {
        setBootError(error instanceof Error ? error.message : "Failed to initialize Desktop Studio.");
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!window.desktop || !activeSessionId || messagesBySession[activeSessionId]) {
      return;
    }

    void (async () => {
      const messages = await window.desktop.listMessages(activeSessionId);
      setMessagesBySession((prev) => ({
        ...prev,
        [activeSessionId]: messages
      }));
    })();
  }, [activeSessionId, messagesBySession]);

  useEffect(() => {
    if (!window.desktop) {
      setBootError((prev) => prev ?? "Desktop bridge unavailable. Preload script failed to initialize.");
      return;
    }

    const removeChunk = window.desktop.onChatChunk((event) => {
      startTransition(() => {
        setMessagesBySession((prev) => {
          const existing = prev[event.sessionId] ?? [];
          return {
            ...prev,
            [event.sessionId]: existing.map((message) =>
              message.id === event.messageId
                ? { ...message, content: message.content + event.chunk, status: "streaming" }
                : message
            )
          };
        });
      });
    });

    const removeDone = window.desktop.onChatDone((event: ChatDoneEvent) => {
      startTransition(() => {
        setMessagesBySession((prev) => {
          const existing = prev[event.sessionId] ?? [];
          return {
            ...prev,
            [event.sessionId]: existing.map((message) =>
              message.id === event.messageId ? { ...message, status: event.status } : message
            )
          };
        });
      });
    });

    return () => {
      removeChunk();
      removeDone();
    };
  }, []);

  const activeMessages = useMemo(() => {
    if (!activeSessionId) {
      return [];
    }

    return messagesBySession[activeSessionId] ?? [];
  }, [activeSessionId, messagesBySession]);

  const chatSessions = useMemo(
    () => sessions.filter((session) => session.mode === "chat"),
    [sessions]
  );

  const createChatSession = async (): Promise<string> => {
    const session = await window.desktop.createSession("chat");
    setSessions((prev) => [session, ...prev.filter((entry) => entry.id !== session.id)]);
    setActiveSessionId(session.id);
    await window.desktop.setActiveSession(session.id);
    setMessagesBySession((prev) => ({ ...prev, [session.id]: [] }));
    return session.id;
  };

  const handleSessionSelect = async (session: Session): Promise<void> => {
    setActiveSessionId(session.id);
    await window.desktop.setActiveSession(session.id);

    if (!messagesBySession[session.id]) {
      const messages = await window.desktop.listMessages(session.id);
      setMessagesBySession((prev) => ({
        ...prev,
        [session.id]: messages
      }));
    }
  };

  const handleSend = async (content: string): Promise<void> => {
    const currentSession = sessions.find((session) => session.id === activeSessionId && session.mode === "chat");
    const sessionId = currentSession?.id ?? (await createChatSession());

    setIsSending(true);

    try {
      const result = await window.desktop.sendMessage({
        sessionId,
        content,
        mode: "chat"
      });

      setMessagesBySession((prev) => ({
        ...prev,
        [sessionId]: [...(prev[sessionId] ?? []), result.userMessage, result.assistantMessage]
      }));

      setSessions((prev) =>
        prev.map((session) =>
          session.id === sessionId
            ? {
                ...session,
                title: content.slice(0, 64),
                updatedAt: new Date().toISOString()
              }
            : session
        )
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleSettingsChange = async (partial: Partial<AppSettings>): Promise<void> => {
    const next = await window.desktop.updateSettings(partial);
    setSettings(next);
  };

  if (isLoading) {
    return <div className="boot-screen">Loading AI Stats Chat...</div>;
  }

  if (bootError) {
    return <div className="boot-screen">Startup Error: {bootError}</div>;
  }

  return (
    <div className="app-shell">
      <Sidebar
        sessions={chatSessions}
        activeSessionId={activeSessionId}
        onCreateSession={() => {
          void createChatSession();
        }}
        onSelectSession={(session) => {
          void handleSessionSelect(session);
        }}
      />

      <main className="main-pane">
        <ChatPane
          messages={activeMessages}
          isSending={isSending}
          settings={settings}
          onSettingsChange={handleSettingsChange}
          onSend={handleSend}
        />
      </main>
    </div>
  );
}
