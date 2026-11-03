import { useEffect, useRef } from "react";
import { appCommand, validateAppCommand, type AppCommandArgs, type AppCommandId, type AppState } from "../../shared/appCommands";
import { useWorkspace, type RightPanelTab, type SettingsPage, type UsageView } from "../app/workspace";
import { showToast } from "../components/ui/toast";
import type { ThemePreference } from "../types";
import { handNewChatDraft } from "./newChatDraft";
import { listSettings, setSetting } from "./appSettings";

type Handler = (args: AppCommandArgs, caller: "agent" | "person") => unknown;
let handlers: Partial<Record<AppCommandId, Handler>> = {};

/**
 * Runs an app command from the window (the palette, a button): renderer commands here, main commands in the main
 * process. Agents reach the same commands through the main process, which asks this window to run renderer ones.
 */
export async function runAppCommand(id: AppCommandId, args: AppCommandArgs = {}) {
	const { command, args: valid } = validateAppCommand(id, args, "person");
	if (command.surface === "main") {
		const api = window.phaseoDesktop?.appCommands;
		if (!api) throw new Error("Open the desktop application to use this command.");
		return api.run(command.id, valid);
	}
	const handler = handlers[command.id as AppCommandId];
	if (!handler) throw new Error(`${command.title} is not available right now.`);
	return handler(valid, "person");
}

/** Binds the renderer commands to the window's state and answers the main process's requests. Mounted once, in the shell. */
export function useAppCommandHost() {
	const workspace = useWorkspace();
	const latest = useRef(workspace);
	latest.current = workspace;
	useEffect(() => {
		const current = () => latest.current;
		handlers = {
			"app.state": (): AppState => {
				const value = current(), chat = value.selectedId ? value.taskById(value.selectedId) : undefined;
				const page = value.settings ? `settings:${value.settings}` : value.scheduled ? "scheduled" : value.pullRequestsPage ? "pull-requests" : value.inboxPage ? "inbox" : value.usagePage ? `usage:${value.usageView}` : value.compareId ? "compare" : value.mode === "code" && value.codeView === "factory" ? "factory" : undefined;
				return { mode: value.mode, ...chat ? { openChat: { id: chat.id, title: chat.title } } : {}, ...page ? { page } : {}, ...value.rightPanel ? { rightPane: value.rightPanel } : {}, theme: value.theme, sidebarOpen: value.sidebarOpen };
			},
			"chat.new": args => { current().select(undefined); if (typeof args.draft === "string") handNewChatDraft(args.draft); },
			"chat.open": async args => {
				// A chat made just now (the operator) reaches the window in the next overview, a render or two away.
				const id = String(args.threadId);
				for (let tries = 0; !current().taskById(id) && tries < 20; tries++) await new Promise(resolve => setTimeout(resolve, 50));
				if (!current().taskById(id)) throw new Error("No chat has that id.");
				current().select(id);
			},
			"mode.set": args => current().setMode(args.mode as "chat" | "code"),
			"inbox.open": () => current().openInbox(),
			"usage.open": args => current().openUsage(args.view as UsageView | undefined),
			"scheduled.open": () => current().openScheduled(),
			"pullRequests.open": () => current().openPullRequests(),
			"factory.open": args => current().openFactory(typeof args.item === "string" ? { item: args.item } : undefined),
			"settings.open": args => current().openSettings(args.page as SettingsPage | undefined),
			"sidebar.set": args => current().setSidebarOpen(open => typeof args.open === "boolean" ? args.open : !open),
			"pane.open": args => current().setRightPanel(args.surface as RightPanelTab),
			"pane.close": () => current().setRightPanel(undefined),
			"theme.set": args => current().setTheme(args.theme as ThemePreference),
			"toast.show": args => { showToast((args.tone as "info" | "success" | "warning" | "error" | undefined) ?? "info", String(args.title), typeof args.detail === "string" ? args.detail : undefined); },
			"palette.open": () => current().setCommandsOpen(true),
			"settings.list": args => listSettings(typeof args.query === "string" ? args.query : undefined),
			"settings.set": (args, caller) => setSetting(args.key, args.value, caller),
		};
		const api = window.phaseoDesktop?.appCommands;
		const unsubscribe = api?.onRequest(request => {
			void (async () => {
				try {
					const handler = handlers[request.command];
					if (!handler || appCommand(request.command)?.surface !== "renderer") throw new Error("This window cannot run that command.");
					api.reply({ requestId: request.requestId, ok: true, result: await handler(request.args, request.caller === "person" ? "person" : "agent") });
				} catch (error) { api.reply({ requestId: request.requestId, ok: false, error: error instanceof Error ? error.message : "The command failed." }); }
			})();
		});
		return () => { unsubscribe?.(); handlers = {}; };
	}, []);
}
