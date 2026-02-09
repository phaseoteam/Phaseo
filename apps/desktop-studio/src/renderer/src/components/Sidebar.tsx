import { memo } from "react";
import clsx from "clsx";
import type { AppSettings, Session, StudioMode } from "@shared/types";

interface SidebarProps {
  mode: StudioMode;
  sessions: Session[];
  activeSessionId: string | null;
  workspacePath: string | null;
  settings: AppSettings;
  onModeChange: (mode: StudioMode) => void;
  onCreateSession: (mode: StudioMode) => void;
  onSelectSession: (session: Session) => void;
  onPickWorkspace: () => void;
  onSettingsChange: (settings: Partial<AppSettings>) => void;
}

export const Sidebar = memo(function Sidebar({
  mode,
  sessions,
  activeSessionId,
  workspacePath,
  settings,
  onModeChange,
  onCreateSession,
  onSelectSession,
  onPickWorkspace,
  onSettingsChange
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>Desktop Studio</h1>
        <p>Local-first AI Chat + Code</p>
      </div>

      <div className="mode-switch" role="tablist" aria-label="Studio mode">
        <button
          className={clsx("mode-button", mode === "chat" && "active")}
          onClick={() => onModeChange("chat")}
          type="button"
        >
          Chat
        </button>
        <button
          className={clsx("mode-button", mode === "code" && "active")}
          onClick={() => onModeChange("code")}
          type="button"
        >
          Code
        </button>
      </div>

      <button className="primary-button" onClick={() => onCreateSession(mode)} type="button">
        New {mode === "chat" ? "Chat" : "Code Session"}
      </button>

      <div className="sidebar-section">
        <div className="section-label">Sessions</div>
        <ul className="session-list">
          {sessions.map((session) => (
            <li key={session.id}>
              <button
                className={clsx("session-item", activeSessionId === session.id && "active")}
                onClick={() => onSelectSession(session)}
                type="button"
              >
                <span className="session-title">{session.title}</span>
                <span className="session-meta">{session.mode.toUpperCase()}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="sidebar-section">
        <div className="section-label">Workspace</div>
        <button className="secondary-button" onClick={onPickWorkspace} type="button">
          {workspacePath ? "Switch Workspace" : "Select Workspace"}
        </button>
        <p className="workspace-path" title={workspacePath ?? "No workspace selected"}>
          {workspacePath ?? "No workspace selected"}
        </p>
      </div>

      <div className="sidebar-section settings-grid">
        <div className="section-label">Model Settings</div>

        <label>
          Provider
          <select
            value={settings.provider}
            onChange={(event) => onSettingsChange({ provider: event.target.value as AppSettings["provider"] })}
          >
            <option value="mock">Mock (offline)</option>
            <option value="openai-compatible">OpenAI-Compatible</option>
          </select>
        </label>

        <label>
          Base URL
          <input
            value={settings.openAiBaseUrl}
            onChange={(event) => onSettingsChange({ openAiBaseUrl: event.target.value })}
            placeholder="https://api.openai.com/v1"
          />
        </label>

        <label>
          Model
          <input
            value={settings.openAiModel}
            onChange={(event) => onSettingsChange({ openAiModel: event.target.value })}
            placeholder="gpt-5-mini"
          />
        </label>

        <label>
          API Key
          <input
            type="password"
            value={settings.openAiApiKey}
            onChange={(event) => onSettingsChange({ openAiApiKey: event.target.value })}
            placeholder="sk-..."
          />
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={settings.commandSafetyPrompt}
            onChange={(event) => onSettingsChange({ commandSafetyPrompt: event.target.checked })}
          />
          Confirm before commands
        </label>
      </div>
    </aside>
  );
});
