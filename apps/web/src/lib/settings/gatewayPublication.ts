export type GatewayPublicationResult = { gatewayCacheInvalidated?: boolean };

// A committed write is still successful when its cache publication fails.
// Do not throw or replay the mutation: creation and reordering are not idempotent.
export function gatewayMutationMessage(message: string, ...results: GatewayPublicationResult[]): string {
	return results.some((result) => result.gatewayCacheInvalidated === false)
		? `${message.replace(/\.$/, "")}; gateway refresh failed. Changes may take longer to apply.`
		: message;
}
