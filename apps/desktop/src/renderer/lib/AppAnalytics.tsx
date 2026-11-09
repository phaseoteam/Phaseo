import { useEffect } from "react";
import { useWorkspace } from "../app/workspace";
import { useWorkspacePreferences } from "./workspacePreferences";

export function AppAnalytics() {
	const { mode, codeView, settings, scheduled, pullRequestsPage, inboxPage, usagePage } = useWorkspace();
	const { analyticsEnabled } = useWorkspacePreferences();
	const screen = settings ? `settings/${settings}` : inboxPage ? "inbox" : usagePage ? "usage" : scheduled ? "scheduled" : pullRequestsPage ? "pull-requests" : mode === "code" && codeView === "factory" ? "factory" : mode;
	useEffect(() => {
		if (analyticsEnabled) void window.phaseoDesktop?.analytics({ type: "screen", screen }).catch(() => {});
	}, [analyticsEnabled, screen]);
	return null;
}
