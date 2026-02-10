import { memo, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { AppSettings, ChatMessage, ProviderProfile } from "@shared/types";
import { Logo } from "./Logo";

interface ChatPaneProps {
  messages: ChatMessage[];
  isSending: boolean;
  settings: AppSettings;
  onSettingsChange: (settings: Partial<AppSettings>) => Promise<void>;
  onSend: (content: string) => Promise<void>;
}

const GATEWAY_BASE_URL = "https://api.phaseo.app/v1";

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

function getGatewayProvider(settings: AppSettings): ProviderProfile | null {
  return (
    settings.providers.find((provider) => provider.id === settings.chatSelection.providerId) ??
    settings.providers.find((provider) => provider.kind === "openai-compatible") ??
    settings.providers[0] ??
    null
  );
}

export const ChatPane = memo(function ChatPane({
  messages,
  isSending,
  settings,
  onSettingsChange,
  onSend
}: ChatPaneProps) {
  const [draft, setDraft] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [syncingProviderId, setSyncingProviderId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string>("");
  const [gatewayApiKeyDraft, setGatewayApiKeyDraft] = useState("");
  const lastAutoSyncKeyRef = useRef<string>("");

  const orderedMessages = useMemo(() => messages, [messages]);
  const gatewayProvider = useMemo(() => getGatewayProvider(settings), [settings]);
  const canSend = draft.trim().length > 0 && !isSending;

  useEffect(() => {
    setGatewayApiKeyDraft(gatewayProvider?.apiKey ?? "");
  }, [gatewayProvider?.id, gatewayProvider?.apiKey]);

  const submit = async (): Promise<void> => {
    if (!canSend) {
      return;
    }

    const content = draft.trim();
    setDraft("");
    await onSend(content);
  };

  const applyGatewayPatch = async (patch: Partial<ProviderProfile>): Promise<void> => {
    if (!gatewayProvider) {
      return;
    }

    const nextModels = uniqueNonEmpty(patch.models ?? gatewayProvider.models);
    const fallbackModel = settings.chatSelection.model || settings.codeSelection.model || "gpt-5-mini";
    if (nextModels.length === 0) {
      nextModels.push(fallbackModel);
    }

    const nextDefaultModelCandidate = (patch.defaultModel ?? gatewayProvider.defaultModel).trim();
    const nextDefaultModel = nextModels.includes(nextDefaultModelCandidate)
      ? nextDefaultModelCandidate
      : (nextModels[0] ?? fallbackModel);

    const nextGatewayProvider: ProviderProfile = {
      ...gatewayProvider,
      ...patch,
      id: gatewayProvider.id,
      name: "AI Stats Gateway",
      kind: "openai-compatible",
      models: nextModels,
      defaultModel: nextDefaultModel
    };

    const providers = settings.providers.some((provider) => provider.id === nextGatewayProvider.id)
      ? settings.providers.map((provider) => (provider.id === nextGatewayProvider.id ? nextGatewayProvider : provider))
      : [nextGatewayProvider];

    const nextChatModel = nextGatewayProvider.models.includes(settings.chatSelection.model)
      ? settings.chatSelection.model
      : nextGatewayProvider.defaultModel;

    const nextCodeModel = nextGatewayProvider.models.includes(settings.codeSelection.model)
      ? settings.codeSelection.model
      : nextGatewayProvider.defaultModel;

    await onSettingsChange({
      providers,
      chatSelection: {
        providerId: nextGatewayProvider.id,
        model: nextChatModel
      },
      codeSelection: {
        providerId: nextGatewayProvider.id,
        model: nextCodeModel
      }
    });
  };

  const saveGatewaySettings = async (options?: { silent?: boolean }): Promise<void> => {
    if (!gatewayProvider) {
      return;
    }

    const nextApiKey = gatewayApiKeyDraft.trim();
    const alreadySaved =
      gatewayProvider.baseUrl.trim() === GATEWAY_BASE_URL &&
      gatewayProvider.apiKey.trim() === nextApiKey;

    if (!alreadySaved) {
      await applyGatewayPatch({
        baseUrl: GATEWAY_BASE_URL,
        apiKey: nextApiKey
      });
    }

    if (!options?.silent) {
      setSyncMessage("API key saved locally.");
    }
  };

  const syncGatewayModels = async (options?: { silent?: boolean; skipCredentialCheck?: boolean }): Promise<void> => {
    const silent = options?.silent === true;
    const provider = gatewayProvider;
    if (!provider) {
      return;
    }

    if (!options?.skipCredentialCheck && (!provider.baseUrl.trim() || !provider.apiKey.trim())) {
      if (!silent) {
        setSyncMessage("Set an API key before syncing models.");
      }
      return;
    }

    setSyncingProviderId(provider.id);
    if (!silent) {
      setSyncMessage("");
    }

    try {
      const models = await window.desktop.fetchProviderModels(provider.id);
      await applyGatewayPatch({
        models,
        defaultModel: models.includes(provider.defaultModel) ? provider.defaultModel : models[0] ?? provider.defaultModel
      });

      if (!silent) {
        setSyncMessage(`Synced ${models.length} models from gateway.`);
      }
    } catch (error) {
      if (!silent) {
        setSyncMessage(error instanceof Error ? error.message : "Failed to sync models from gateway.");
      }
    } finally {
      setSyncingProviderId(null);
    }
  };

  useEffect(() => {
    if (!gatewayProvider || !gatewayProvider.baseUrl.trim() || !gatewayProvider.apiKey.trim()) {
      return;
    }

    const nextKey = [
      gatewayProvider.id,
      gatewayProvider.baseUrl.trim(),
      gatewayProvider.apiKey.trim()
    ].join("|");

    if (lastAutoSyncKeyRef.current === nextKey) {
      return;
    }

    lastAutoSyncKeyRef.current = nextKey;
    void syncGatewayModels({ silent: true });
  }, [gatewayProvider?.id, gatewayProvider?.baseUrl, gatewayProvider?.apiKey]);

  return (
    <section className="chat-pane">
      <header className="pane-header chat-header">
        <div className="chat-title-line">
          <h2>Unified Chat</h2>
          <p>Gateway-first local chat with web-aligned controls.</p>
        </div>

        <div className="chat-header-controls">
          <div className="active-model-badge">
            {gatewayProvider ? <Logo provider={gatewayProvider} size={18} /> : null}
            <span>{gatewayProvider?.name ?? "AI Stats Gateway"}</span>
          </div>

          <label className="header-select-wrap">
            <span>Model</span>
            <select
              value={settings.chatSelection.model}
              onChange={(event) =>
                void onSettingsChange({
                  chatSelection: {
                    ...settings.chatSelection,
                    providerId: gatewayProvider?.id ?? settings.chatSelection.providerId,
                    model: event.target.value
                  }
                })
              }
            >
              {(gatewayProvider?.models ?? []).map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>

          <button type="button" className="secondary-button" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={!gatewayProvider || syncingProviderId === gatewayProvider.id}
            onClick={() => {
              void (async () => {
                await saveGatewaySettings({ silent: true });
                await syncGatewayModels({ skipCredentialCheck: true });
              })();
            }}
          >
            {syncingProviderId === gatewayProvider?.id ? "Syncing..." : "Sync Models"}
          </button>
          <span className="pane-status-badge">{isSending ? "Thinking..." : "Ready"}</span>
        </div>
      </header>

      <div className="message-list chat-message-list">
        {orderedMessages.length === 0 ? (
          <div className="chat-empty-state">
            <h3>Start a conversation</h3>
            <p>Configure your gateway key once, then chat with any synced model.</p>
          </div>
        ) : (
          orderedMessages.map((message) => (
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
          ))
        )}
      </div>

      <div className="chat-composer-shell">
        <div className="composer chat-composer">
          <textarea
            value={draft}
            placeholder="Message AI Stats..."
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <div className="composer-meta">
            <span className="composer-chip">
              {gatewayProvider ? <Logo provider={gatewayProvider} size={14} /> : null}
              {gatewayProvider?.name ?? "AI Stats Gateway"}
            </span>
            <span className="composer-chip">{settings.chatSelection.model || "No model"}</span>
          </div>
          <button type="button" className="primary-button chat-send-button" disabled={!canSend} onClick={() => void submit()}>
            Send
          </button>
        </div>
      </div>

      {settingsOpen ? (
        <div className="settings-overlay" role="dialog" aria-modal="true">
          <div
            className="settings-scrim"
            onClick={() => {
              setSettingsOpen(false);
              void saveGatewaySettings({ silent: true });
            }}
          />
          <section className="settings-panel">
            <header className="settings-panel-header">
              <h3>Chat Settings</h3>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setSettingsOpen(false);
                  void saveGatewaySettings({ silent: true });
                }}
              >
                Close
              </button>
            </header>

            <div className="settings-block">
              <div className="section-label">Appearance</div>
              <label>
                Theme
                <select
                  value={settings.theme}
                  onChange={(event) =>
                    void onSettingsChange({
                      theme: event.target.value as AppSettings["theme"]
                    })
                  }
                >
                  <option value="system">System</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>
            </div>

            <div className="settings-block">
              <div className="section-label">Gateway</div>

              {gatewayProvider ? (
                <div className="provider-preview-row">
                  <Logo provider={gatewayProvider} size={20} />
                  <strong>{gatewayProvider.name}</strong>
                </div>
              ) : null}

              <label>
                Gateway URL
                <input
                  value={GATEWAY_BASE_URL}
                  readOnly
                />
              </label>

              <label>
                API Key
                <input
                  type="password"
                  value={gatewayApiKeyDraft}
                  onChange={(event) => setGatewayApiKeyDraft(event.target.value)}
                  onBlur={() => {
                    void saveGatewaySettings({ silent: true });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void saveGatewaySettings();
                    }
                  }}
                  placeholder="as_live_..."
                />
              </label>

              <p className="sync-status-text">API key is saved locally as soon as you press Enter or leave the field.</p>

              <div className="provider-actions-row">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => {
                    void saveGatewaySettings();
                  }}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={syncingProviderId === gatewayProvider?.id}
                  onClick={() => {
                    void (async () => {
                      await saveGatewaySettings({ silent: true });
                      await syncGatewayModels({ skipCredentialCheck: true });
                    })();
                  }}
                >
                  {syncingProviderId === gatewayProvider?.id ? "Syncing..." : "Save + Sync Models"}
                </button>
              </div>

              {syncMessage ? <p className="sync-status-text">{syncMessage}</p> : null}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
});
