// Whether the webhook settings are enabled for this account and a workspace is selected.
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { webQueryKeys } from "@/lib/query/queryKeys";

const loadWebhookAvailability = createServerFn({ method: "GET" }).handler(async () => {
	const { webhookSettingsEnabled } = await import("@/lib/flags");
	if (!(await webhookSettingsEnabled())) return { enabled: false, hasWorkspace: false };
	const { getServerAccountContext } = await import("@/lib/fetchers/internal/serverAccountContext");
	const { accessToken, workspaceId } = await getServerAccountContext();
	return { enabled: true, hasWorkspace: Boolean(accessToken && workspaceId) };
});

export const webhookAvailabilityQuery = () =>
	queryOptions({
		queryKey: [...webQueryKeys.account.all(), "settings-webhook-availability"],
		queryFn: () => loadWebhookAvailability(),
	});
