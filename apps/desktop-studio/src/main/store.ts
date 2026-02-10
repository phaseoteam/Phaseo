import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { nanoid } from "nanoid";
import type {
  AppSettings,
  BootstrapData,
  ChatMessage,
  ModeModelSelection,
  ProviderProfile,
  Session,
  StoreShape,
  ThemePreference,
  StudioMode
} from "@shared/types";

const STORE_FILENAME = "studio-store-v1.json";

const DEFAULT_GATEWAY_PROVIDER: ProviderProfile = {
  id: "provider-ai-stats-gateway",
  name: "AI Stats Gateway",
  kind: "openai-compatible",
  baseUrl: "https://api.phaseo.app/v1",
  apiKey: "",
  models: ["gpt-5-mini", "gpt-5"],
  defaultModel: "gpt-5-mini"
};

const DEFAULT_SETTINGS: AppSettings = {
  providers: [DEFAULT_GATEWAY_PROVIDER],
  chatSelection: {
    providerId: DEFAULT_GATEWAY_PROVIDER.id,
    model: DEFAULT_GATEWAY_PROVIDER.defaultModel
  },
  codeSelection: {
    providerId: DEFAULT_GATEWAY_PROVIDER.id,
    model: DEFAULT_GATEWAY_PROVIDER.defaultModel
  },
  commandSafetyPrompt: true,
  theme: "system"
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

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    output.push(trimmed);
  }
  return output;
}

function cloneSettings(settings: AppSettings): AppSettings {
  return {
    providers: settings.providers.map((provider) => ({
      ...provider,
      models: [...provider.models]
    })),
    chatSelection: { ...settings.chatSelection },
    codeSelection: { ...settings.codeSelection },
    commandSafetyPrompt: settings.commandSafetyPrompt,
    theme: settings.theme
  };
}

function normalizeThemePreference(value: unknown): ThemePreference {
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }

  return "system";
}

function normalizeProvider(input: any): ProviderProfile {
  const kind = "openai-compatible";
  const models = uniqueNonEmpty(
    Array.isArray(input?.models)
      ? input.models.map((value: unknown) => String(value))
      : String(input?.defaultModel ?? DEFAULT_GATEWAY_PROVIDER.defaultModel).split(",")
  );

  const fallbackModel =
    String(input?.defaultModel ?? DEFAULT_GATEWAY_PROVIDER.defaultModel).trim() ||
    DEFAULT_GATEWAY_PROVIDER.defaultModel;

  if (models.length === 0) {
    models.push(fallbackModel);
  }

  const defaultModel =
    String(input?.defaultModel ?? models[0] ?? fallbackModel).trim() || models[0] || fallbackModel;

  if (!models.includes(defaultModel)) {
    models.unshift(defaultModel);
  }

  return {
    id: String(input?.id ?? DEFAULT_GATEWAY_PROVIDER.id).trim() || DEFAULT_GATEWAY_PROVIDER.id,
    name: String(input?.name ?? DEFAULT_GATEWAY_PROVIDER.name).trim() || DEFAULT_GATEWAY_PROVIDER.name,
    kind,
    baseUrl: DEFAULT_GATEWAY_PROVIDER.baseUrl,
    apiKey: String(input?.apiKey ?? ""),
    models,
    defaultModel
  };
}

function normalizeSelection(
  selection: Partial<ModeModelSelection> | undefined,
  providers: ProviderProfile[],
  fallbackProviderId: string
): ModeModelSelection {
  const providerId = selection?.providerId && providers.some((provider) => provider.id === selection.providerId)
    ? selection.providerId
    : fallbackProviderId;

  const provider = providers.find((item) => item.id === providerId) ?? providers[0];
  const model = selection?.model?.trim();

  if (!provider) {
    return {
      providerId: fallbackProviderId,
      model: ""
    };
  }

  if (model && provider.models.includes(model)) {
    return {
      providerId,
      model
    };
  }

  return {
    providerId,
    model: provider.defaultModel || provider.models[0] || ""
  };
}

function normalizeSettings(raw: any): AppSettings {
  const legacyModel = String(raw?.openAiModel ?? DEFAULT_GATEWAY_PROVIDER.defaultModel);
  const legacyApiKey = String(raw?.openAiApiKey ?? "");

  const providersRaw: unknown[] = Array.isArray(raw?.providers) && raw.providers.length > 0
    ? raw.providers
    : [{
      ...DEFAULT_GATEWAY_PROVIDER,
      apiKey: legacyApiKey,
      defaultModel: legacyModel,
      models: uniqueNonEmpty([legacyModel, ...DEFAULT_GATEWAY_PROVIDER.models])
    }];

  const selectedGatewaySource =
    providersRaw.find(
      (provider) => provider && typeof provider === "object" && (provider as ProviderProfile).kind === "openai-compatible"
    ) ??
    {
      ...DEFAULT_GATEWAY_PROVIDER,
      apiKey: legacyApiKey,
      defaultModel: legacyModel,
      models: uniqueNonEmpty([legacyModel, ...DEFAULT_GATEWAY_PROVIDER.models])
    };

  const gatewayProvider: ProviderProfile = {
    ...normalizeProvider(selectedGatewaySource),
    id: DEFAULT_GATEWAY_PROVIDER.id,
    name: DEFAULT_GATEWAY_PROVIDER.name
  };

  const providers: ProviderProfile[] = [gatewayProvider];
  const defaultLegacySelection: Partial<ModeModelSelection> = {
    providerId: gatewayProvider.id,
    model: legacyModel
  };

  const chatSelection = normalizeSelection(raw?.chatSelection ?? defaultLegacySelection, providers, gatewayProvider.id);
  const codeSelection = normalizeSelection(raw?.codeSelection ?? defaultLegacySelection, providers, gatewayProvider.id);

  return {
    providers,
    chatSelection,
    codeSelection,
    commandSafetyPrompt: raw?.commandSafetyPrompt !== false,
    theme: normalizeThemePreference(raw?.theme)
  };
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
        return { ...DEFAULT_STORE, settings: cloneSettings(DEFAULT_SETTINGS) };
      }

      const raw = readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<StoreShape>;

      return {
        sessions: parsed.sessions ?? [],
        messages: parsed.messages ?? [],
        settings: normalizeSettings(parsed.settings ?? {}),
        activeSessionId: parsed.activeSessionId ?? null,
        workspacePath: parsed.workspacePath ?? null
      };
    } catch {
      return { ...DEFAULT_STORE, settings: cloneSettings(DEFAULT_SETTINGS) };
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf8");
  }

  bootstrap(): BootstrapData {
    return {
      sessions: [...this.data.sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      settings: cloneSettings(this.data.settings),
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
    const candidate: Partial<AppSettings> = {
      ...this.data.settings,
      ...partial,
      chatSelection: {
        ...this.data.settings.chatSelection,
        ...(partial.chatSelection ?? {})
      },
      codeSelection: {
        ...this.data.settings.codeSelection,
        ...(partial.codeSelection ?? {})
      }
    };

    this.data.settings = normalizeSettings(candidate);
    this.persist();
    return cloneSettings(this.data.settings);
  }

  getSettings(): AppSettings {
    return cloneSettings(this.data.settings);
  }

  setWorkspace(path: string | null): void {
    this.data.workspacePath = path;
    this.persist();
  }
}
