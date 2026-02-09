import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { nanoid } from "nanoid";
import type {
  AppSettings,
  BootstrapData,
  ChatMessage,
  Session,
  StoreShape,
  StudioMode
} from "@shared/types";

const STORE_FILENAME = "studio-store-v1.json";

const DEFAULT_SETTINGS: AppSettings = {
  provider: "mock",
  openAiBaseUrl: "https://api.openai.com/v1",
  openAiApiKey: "",
  openAiModel: "gpt-5-mini",
  commandSafetyPrompt: true
};

const DEFAULT_STORE: StoreShape = {
  sessions: [],
  messages: [],
  settings: DEFAULT_SETTINGS,
  activeSessionId: null,
  workspacePath: null
};

function nowIso(): string {
  return new Date().toISOString();
}

export class StudioStore {
  private readonly filePath: string;

  private data: StoreShape;

  constructor(userDataPath: string) {
    this.filePath = join(userDataPath, STORE_FILENAME);
    this.data = this.load();
  }

  private load(): StoreShape {
    try {
      if (!existsSync(this.filePath)) {
        return { ...DEFAULT_STORE, settings: { ...DEFAULT_SETTINGS } };
      }

      const raw = readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<StoreShape>;
      return {
        sessions: parsed.sessions ?? [],
        messages: parsed.messages ?? [],
        settings: {
          ...DEFAULT_SETTINGS,
          ...(parsed.settings ?? {})
        },
        activeSessionId: parsed.activeSessionId ?? null,
        workspacePath: parsed.workspacePath ?? null
      };
    } catch {
      return { ...DEFAULT_STORE, settings: { ...DEFAULT_SETTINGS } };
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf8");
  }

  bootstrap(): BootstrapData {
    return {
      sessions: [...this.data.sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      settings: { ...this.data.settings },
      activeSessionId: this.data.activeSessionId,
      workspacePath: this.data.workspacePath
    };
  }

  createSession(mode: StudioMode): Session {
    const timestamp = nowIso();
    const session: Session = {
      id: nanoid(),
      title: mode === "chat" ? "New Chat" : "New Code Session",
      mode,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    this.data.sessions.unshift(session);
    this.data.activeSessionId = session.id;
    this.persist();
    return session;
  }

  setActiveSession(sessionId: string): void {
    const found = this.data.sessions.some((item) => item.id === sessionId);
    this.data.activeSessionId = found ? sessionId : this.data.activeSessionId;
    this.persist();
  }

  listMessages(sessionId: string): ChatMessage[] {
    return this.data.messages.filter((message) => message.sessionId === sessionId);
  }

  private touchSession(sessionId: string): void {
    const session = this.data.sessions.find((item) => item.id === sessionId);
    if (!session) {
      return;
    }

    session.updatedAt = nowIso();
    const [extracted] = this.data.sessions.splice(this.data.sessions.indexOf(session), 1);
    if (extracted) {
      this.data.sessions.unshift(extracted);
    }
  }

  addMessage(
    sessionId: string,
    role: ChatMessage["role"],
    content: string,
    model?: string,
    status: ChatMessage["status"] = "done"
  ): ChatMessage {
    const message: ChatMessage = {
      id: nanoid(),
      sessionId,
      role,
      content,
      createdAt: nowIso(),
      model,
      status
    };

    this.data.messages.push(message);
    this.touchSession(sessionId);

    if (role === "user" && content.trim().length > 0) {
      const title = content.trim().slice(0, 64);
      const session = this.data.sessions.find((item) => item.id === sessionId);
      if (session && (session.title === "New Chat" || session.title === "New Code Session")) {
        session.title = title;
      }
    }

    this.persist();
    return message;
  }

  appendToMessage(messageId: string, chunk: string): ChatMessage | null {
    const message = this.data.messages.find((item) => item.id === messageId);
    if (!message) {
      return null;
    }

    message.content += chunk;
    message.status = "streaming";
    this.touchSession(message.sessionId);
    this.persist();
    return message;
  }

  setMessageStatus(messageId: string, status: ChatMessage["status"]): ChatMessage | null {
    const message = this.data.messages.find((item) => item.id === messageId);
    if (!message) {
      return null;
    }

    message.status = status;
    this.touchSession(message.sessionId);
    this.persist();
    return message;
  }

  updateSettings(partial: Partial<AppSettings>): AppSettings {
    this.data.settings = {
      ...this.data.settings,
      ...partial
    };
    this.persist();
    return this.data.settings;
  }

  getSettings(): AppSettings {
    return { ...this.data.settings };
  }

  setWorkspace(path: string | null): void {
    this.data.workspacePath = path;
    this.persist();
  }
}
