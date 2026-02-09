import { Suspense, lazy, startTransition, useEffect, useMemo, useState } from "react";
import type {
  AppSettings,
  ChatDoneEvent,
  ChatMessage,
  CommandOutputChunk,
  CommandRun,
  Session,
  StudioMode,
  WorkspaceFile
} from "@shared/types";
import { ChatPane } from "./components/ChatPane";
import { Sidebar } from "./components/Sidebar";

const CodePane = lazy(async () => {
  const mod = await import("./components/CodePane");
  return { default: mod.CodePane };
});

const EMPTY_SETTINGS: AppSettings = {
  provider: "mock",
  openAiBaseUrl: "https://api.openai.com/v1",
  openAiApiKey: "",
  openAiModel: "gpt-5-mini",
  commandSafetyPrompt: true
};

export function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [mode, setMode] = useState<StudioMode>("chat");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messagesBySession, setMessagesBySession] = useState<Record<string, ChatMessage[]>>({});
  const [isSending, setIsSending] = useState(false);

  const [settings, setSettings] = useState<AppSettings>(EMPTY_SETTINGS);
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [isFileDirty, setIsFileDirty] = useState(false);

  const [commandRuns, setCommandRuns] = useState<CommandRun[]>([]);
  const [commandOutputByRun, setCommandOutputByRun] = useState<Record<string, string>>({});

  useEffect(() => {
    void (async () => {
      const data = await window.desktop.bootstrap();
      setSessions(data.sessions);
      setSettings(data.settings);
      setActiveSessionId(data.activeSessionId);
      setWorkspacePath(data.workspacePath);

      const active = data.sessions.find((session) => session.id === data.activeSessionId);
      if (active) {
        setMode(active.mode);
      }

      if (data.workspacePath) {
        const files = await window.desktop.listWorkspaceFiles(data.workspacePath);
        setWorkspaceFiles(files);
      }

      setIsLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!activeSessionId || messagesBySession[activeSessionId]) {
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

    const removeOutput = window.desktop.onCommandOutput((event: CommandOutputChunk) => {
      setCommandOutputByRun((prev) => ({
        ...prev,
        [event.runId]: `${prev[event.runId] ?? ""}${event.chunk}`
      }));
    });

    const removeCommandDone = window.desktop.onCommandDone((run) => {
      setCommandRuns((prev) => prev.map((entry) => (entry.id === run.id ? run : entry)));
    });

    return () => {
      removeChunk();
      removeDone();
      removeOutput();
      removeCommandDone();
    };
  }, []);

  const activeMessages = useMemo(() => {
    if (!activeSessionId) {
      return [];
    }

    return messagesBySession[activeSessionId] ?? [];
  }, [activeSessionId, messagesBySession]);

  const createSession = async (targetMode: StudioMode): Promise<string> => {
    const session = await window.desktop.createSession(targetMode);
    setSessions((prev) => [session, ...prev]);
    setActiveSessionId(session.id);
    setMode(targetMode);
    await window.desktop.setActiveSession(session.id);
    setMessagesBySession((prev) => ({ ...prev, [session.id]: [] }));
    return session.id;
  };

  const handleSessionSelect = async (session: Session): Promise<void> => {
    setActiveSessionId(session.id);
    setMode(session.mode);
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
    const sessionId = activeSessionId ?? (await createSession(mode));
    setIsSending(true);

    const result = await window.desktop.sendMessage({
      sessionId,
      content,
      mode
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

    setIsSending(false);
  };

  const handleSettingsChange = async (partial: Partial<AppSettings>): Promise<void> => {
    const next = await window.desktop.updateSettings(partial);
    setSettings(next);
  };

  const refreshWorkspaceFiles = async (path = workspacePath): Promise<void> => {
    if (!path) {
      setWorkspaceFiles([]);
      return;
    }

    const files = await window.desktop.listWorkspaceFiles(path);
    setWorkspaceFiles(files);
  };

  const handlePickWorkspace = async (): Promise<void> => {
    const selected = await window.desktop.pickWorkspace();
    if (!selected) {
      return;
    }

    setWorkspacePath(selected);
    await refreshWorkspaceFiles(selected);
    setSelectedFilePath(null);
    setFileContent("");
    setIsFileDirty(false);
  };

  const handleOpenFile = async (relativePath: string): Promise<void> => {
    if (!workspacePath) {
      return;
    }

    const content = await window.desktop.readWorkspaceFile(workspacePath, relativePath);
    setSelectedFilePath(relativePath);
    setFileContent(content);
    setIsFileDirty(false);
  };

  const handleSaveFile = async (): Promise<void> => {
    if (!workspacePath || !selectedFilePath) {
      return;
    }

    await window.desktop.writeWorkspaceFile(workspacePath, selectedFilePath, fileContent);
    setIsFileDirty(false);
  };

  const handleRunCommand = async (command: string): Promise<void> => {
    if (!workspacePath) {
      return;
    }

    if (settings.commandSafetyPrompt && !window.confirm(`Run command?\n\n${command}`)) {
      return;
    }

    const run = await window.desktop.runCommand({ workspacePath, command });
    setCommandRuns((prev) => [run, ...prev]);
    setCommandOutputByRun((prev) => ({ ...prev, [run.id]: "" }));
  };

  const handleStopCommand = async (runId: string): Promise<void> => {
    await window.desktop.stopCommand(runId);
  };

  if (isLoading) {
    return <div className="boot-screen">Loading Desktop Studio...</div>;
  }

  return (
    <div className="app-shell">
      <Sidebar
        mode={mode}
        sessions={sessions}
        activeSessionId={activeSessionId}
        workspacePath={workspacePath}
        settings={settings}
        onModeChange={setMode}
        onCreateSession={(targetMode) => {
          void createSession(targetMode);
        }}
        onSelectSession={(session) => {
          void handleSessionSelect(session);
        }}
        onPickWorkspace={() => {
          void handlePickWorkspace();
        }}
        onSettingsChange={(partial) => {
          void handleSettingsChange(partial);
        }}
      />

      <main className="main-pane">
        {mode === "chat" ? (
          <ChatPane messages={activeMessages} isSending={isSending} onSend={handleSend} />
        ) : (
          <Suspense fallback={<div className="boot-screen">Loading Code Mode...</div>}>
            <CodePane
              workspacePath={workspacePath}
              files={workspaceFiles}
              selectedFilePath={selectedFilePath}
              fileContent={fileContent}
              isDirty={isFileDirty}
              commandRuns={commandRuns}
              commandOutputByRun={commandOutputByRun}
              onPickWorkspace={() => {
                void handlePickWorkspace();
              }}
              onRefreshFiles={() => {
                void refreshWorkspaceFiles();
              }}
              onOpenFile={handleOpenFile}
              onChangeFileContent={(next) => {
                setFileContent(next);
                setIsFileDirty(true);
              }}
              onSaveFile={handleSaveFile}
              onRunCommand={handleRunCommand}
              onStopCommand={handleStopCommand}
            />
          </Suspense>
        )}
      </main>
    </div>
  );
}
