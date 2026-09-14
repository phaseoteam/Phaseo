export type ChatModelSelectionOption = {
	gatewayStatus: "active" | "inactive";
	chatBlockedReasons: readonly unknown[];
};

export function isChatModelRowDisabled(
	option: ChatModelSelectionOption,
	options: {
		capabilityCompatible: boolean;
		withComingSoonBadge?: boolean;
	},
) {
	return (
		options.withComingSoonBadge === true ||
		option.gatewayStatus === "inactive" ||
		option.chatBlockedReasons.length > 0 ||
		!options.capabilityCompatible
	);
}
