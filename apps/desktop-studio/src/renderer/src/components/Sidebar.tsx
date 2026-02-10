import { memo } from "react";
import clsx from "clsx";
import type { Session } from "@shared/types";

interface SidebarProps {
  sessions: Session[];
  activeSessionId: string | null;
  onCreateSession: () => void;
  onSelectSession: (session: Session) => void;
}

function formatSessionTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Chat";
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric"
  });
}

export const Sidebar = memo(function Sidebar({
  sessions,
  activeSessionId,
  onCreateSession,
  onSelectSession
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <img src="/wordmark_light.svg" alt="AI Stats" className="wordmark wordmark-light" />
        <img src="/wordmark_dark.svg" alt="AI Stats" className="wordmark wordmark-dark" />
        <p>Unified chat</p>
      </div>

      <button className="primary-button" onClick={onCreateSession} type="button">
        New Chat
      </button>

      <div className="sidebar-section">
        <div className="section-label">Chats</div>
        <ul className="session-list">
          {sessions.map((session) => (
            <li key={session.id}>
              <button
                className={clsx("session-item", activeSessionId === session.id && "active")}
                onClick={() => onSelectSession(session)}
                type="button"
              >
                <span className="session-title">{session.title}</span>
                <span className="session-meta">{formatSessionTimestamp(session.updatedAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
});
