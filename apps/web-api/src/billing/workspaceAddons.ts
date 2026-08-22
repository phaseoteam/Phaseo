type AddonClient = {
	from: (table: string) => any;
};

export async function workspaceHasAddon(
	client: AddonClient,
	workspaceId: string,
	addonKey: string,
): Promise<boolean> {
	const result = await client
		.from("workspace_addon_subscriptions")
		.select("status,grace_until")
		.eq("workspace_id", workspaceId)
		.eq("addon_key", addonKey)
		.maybeSingle();
	if (result.error) return false;
	const status = String(result.data?.status ?? "").toLowerCase();
	if (status === "active" || status === "trialing") return true;
	return status === "past_due"
		&& Boolean(result.data?.grace_until)
		&& Date.parse(String(result.data.grace_until)) > Date.now();
}
