export type KeyIncidentAction = "revoke" | "pause";

export type KeyIncidentScope = { locationId: string; action: KeyIncidentAction; keysCreatedBefore: string };

export type KeyIncident = {
	id: string;
	location_id: string;
	action: KeyIncidentAction;
	keys_created_before: string;
	title: string;
	customer_message: string;
	source_url: string | null;
	declared_by: string | null;
	created_at: string;
	applied_at: string | null;
	affected_keys: number | null;
	affected_workspaces: number | null;
};
