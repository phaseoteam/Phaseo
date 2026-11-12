import { Hono } from "hono";
import type { Env } from "@/env";
import { SLACK_AGENT_PAGE_ID_PATTERN, type SlackAgentPages } from "@/lib/slack-agent-admin";
import { auditSlack, badRequest, json, readBody } from "./settings-slack";
import { managedInstallation } from "./settings-slack-memory";

// The Slack agent's shared pages, for the live installation's owners and admins:
// the HTML pages the agent published, with their titles, who asked for them, when
// they expire and how often they were opened. The Slack Worker keeps them (one
// store per installation) and answers through the SLACK_AGENT service binding.
// Where the binding isn't set (outside production), there are none to show.
// Audit events record that a page was deleted, never its id or title.

const MAX_LIVE_PAGES = 200;

function unavailable(): SlackAgentPages {
	return { available: false, sign_in: false, pages: [], limit: MAX_LIVE_PAGES };
}

export const accountSettingsSlackPagesRouter = new Hono<{ Bindings: Env }>();

accountSettingsSlackPagesRouter.get("/slack/pages", async (c) => {
	const workspaceId = c.req.query("workspaceId")?.trim();
	if (!workspaceId) return badRequest(c, "workspaceId is required");
	const access = await managedInstallation(c, workspaceId);
	if ("response" in access) return access.response;
	if (!c.env.SLACK_AGENT) return json(c, unavailable());
	try {
		return json(c, await c.env.SLACK_AGENT.listPages(access.installation.id));
	} catch {
		console.error("[slack-agent] shared pages unavailable", { installationId: access.installation.id });
		return json(c, { error: "settings_unavailable" }, 503);
	}
});

accountSettingsSlackPagesRouter.delete("/slack/pages/:id", async (c) => {
	const id = c.req.param("id");
	if (!SLACK_AGENT_PAGE_ID_PATTERN.test(id)) return badRequest(c, "id must be a page id");
	const body = await readBody(c);
	const access = await managedInstallation(c, body.workspaceId ?? c.req.query("workspaceId"));
	if ("response" in access) return access.response;
	const { context, installation } = access;
	if (!c.env.SLACK_AGENT) return json(c, { error: "page_not_found", message: "It was deleted meanwhile, or has expired. Reload to see what is left" }, 404);
	let deleted: boolean;
	try {
		deleted = await c.env.SLACK_AGENT.deletePage(installation.id, id);
	} catch {
		console.error("[slack-agent] shared page not deleted", { installationId: installation.id });
		return json(c, { error: "settings_write_failed" }, 503);
	}
	if (!deleted) return json(c, { error: "page_not_found", message: "It was deleted meanwhile, or has expired. Reload to see what is left" }, 404);
	await auditSlack(c, context, "page_deleted", { id: installation.id, name: installation.team_name }, { installation_id: installation.id });
	return json(c, { id, deleted: true });
});
