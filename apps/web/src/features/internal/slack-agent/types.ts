export type SlackAgentInstallationStatus = "active" | "paused" | "payment_due" | "uninstalled";

/** One row of GET /api/internal/slack-agent/installations. The month figures are summed in the database. */
export type SlackAgentInstallation = {
	id: string;
	workspace_id: string;
	workspace_name: string | null;
	team_id: string | null;
	team_name: string | null;
	enterprise_id: string | null;
	custom_app: boolean;
	slack_app_id: string | null;
	status: SlackAgentInstallationStatus;
	installed_at: string;
	uninstalled_at: string | null;
	plan_people: number;
	month: {
		people: number;
		answers: number;
		estimated_charge_usd: number;
		model_requests: number;
		model_spend_usd: number;
	};
};

export type SlackAgentInstallationsPage = {
	period_start: string;
	offset: number;
	page_size: number;
	total: number;
	installations: SlackAgentInstallation[];
};
