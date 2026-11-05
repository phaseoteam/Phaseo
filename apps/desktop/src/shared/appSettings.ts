import type { WorkspacePreferences } from "./preferences";

/**
 * Every setting an agent can read and change through the settings.list and settings.set app commands. Workspace
 * preferences must each have an entry (the `satisfies` below fails the build otherwise), so a new preference is agent
 * controllable from the start; the main process validates values exactly as it does for the Settings page.
 */
export type SettingType = { type: "boolean" } | { type: "enum"; values: readonly string[] } | { type: "integer"; minimum: number; maximum: number; nullable?: boolean } | { type: "model"; nullable: true } | { type: "object" };
export type SettingSpec = SettingType & { label: string; page: string; description: string };

export const workspaceSettings = {
	notifications: { label: "Desktop alerts", page: "notifications", description: "When to alert while Phaseo is in the background: off, attention (needs you) or all.", type: "enum", values: ["off", "attention", "all"] },
	notificationTitles: { label: "Show chat titles", page: "notifications", description: "Alerts name the chat.", type: "boolean" },
	inAppNotifications: { label: "In-app notices", page: "notifications", description: "A notice when another chat finishes or needs the person while Phaseo is open.", type: "boolean" },
	notificationBadge: { label: "Unread count on the app icon", page: "notifications", description: "Count unread chats on the dock or taskbar icon.", type: "boolean" },
	maxActiveAgents: { label: "Agents running at once", page: "general", description: "The most delegated agents working at once.", type: "integer", minimum: 1, maximum: 256 },
	autoSettleAfterDays: { label: "Auto-settle inactive chats", page: "general", description: "Days of inactivity before a Code chat settles; null never settles.", type: "integer", minimum: 1, maximum: 90, nullable: true },
	autoSettleOnMerge: { label: "Auto-settle merged chats", page: "general", description: "Settle a chat when its pull request merges.", type: "boolean" },
	keepPullRequests: { label: "Keep chats with a pull request", page: "general", description: "Inactivity does not settle chats with a pull request.", type: "boolean" },
	titleModel: { label: "Title model", page: "general", description: "The Phaseo model that names new chats; null keeps the first message as the title.", type: "model", nullable: true },
	openPullRequestsInApp: { label: "Open pull requests in Phaseo", page: "general", description: "Pull request links open in Phaseo rather than GitHub.", type: "boolean" },
	pullRequestMergeMethod: { label: "Default merge method", page: "general", description: "merge, squash or rebase; null reuses the last one chosen.", type: "enum", values: ["merge", "squash", "rebase"] },
	diffFilesCollapsed: { label: "Default diff file state", page: "general", description: "true starts diffs with files collapsed.", type: "boolean" },
	autopilot: { label: "Allow Autopilot", page: "experimental", description: "Lets Code chats run in Autopilot with full access.", type: "boolean" },
	autopilotModel: { label: "Autopilot model", page: "experimental", description: "The Phaseo model Autopilot asks; null uses the title model.", type: "model", nullable: true },
	worktreeCleanup: { label: "Worktree cleanup", page: "worktrees", description: "When worktrees are cleaned up automatically, as the object Settings shows.", type: "object" },
	chat: { label: "Chat", page: "chat", description: "Follow-ups (queue or steer), the rich text composer, quit confirmation, diff layout, whitespace and colours, opening at login and keeping Phaseo in the tray, as the object Settings → Chat shows.", type: "object" },
	browser: { label: "Browser", page: "browser", description: "Where links open, the search engine, whether agents get browser tools, and browser profiles, as the object Settings → Browser shows.", type: "object" },
	sourceControl: { label: "Source control", page: "source-control", description: "Worktree folder, branch naming, submodules, commit and pull request writing instructions and the Git model, as the object Settings → Source control shows.", type: "object" },
	threads: { label: "Threads", page: "threads", description: "Usage-limit resume and snooze, continuing after a restart, idle compaction, response streaming, provider health checks and log retention, as the object Settings → Threads shows.", type: "object" },
} as const satisfies Record<keyof WorkspacePreferences, SettingSpec>;

export type WorkspaceSettingKey = keyof typeof workspaceSettings;
export const isWorkspaceSetting = (key: string): key is WorkspaceSettingKey => Object.hasOwn(workspaceSettings, key);
