export const FREE_ROUTER_MODEL_ID = "phaseo/free";
export const FREE_ROUTER_ORGANISATION_ID = "phaseo";
export const FREE_ROUTER_NAME = "Free Models Router";
export const FREE_ROUTER_PRIMARY_DATE = "2026-05-12";
export const FREE_ROUTER_PRIMARY_TIMESTAMP = new Date(
	`${FREE_ROUTER_PRIMARY_DATE}T00:00:00.000Z`,
).getTime();
export const FREE_ROUTER_DESCRIPTION =
	"Routes each request to an eligible free model pool with provider-aware balancing. Review the currently eligible models and recent routed usage here.";

export function isFreeRouterModelId(modelId: string | null | undefined): boolean {
	return String(modelId ?? "").trim().toLowerCase() === FREE_ROUTER_MODEL_ID;
}
