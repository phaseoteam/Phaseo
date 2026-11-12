import { resolveEnforcedZdr } from "@/components/(data)/model/pricing/zdr";

/** Preview the same active retention guarantee used by gateway routing. */
export function capabilityPrivacyDecision(args: {
	row: { providerPolicy?: { zeroDataRetention: boolean; dataPolicyTier: string; dataPolicyConfidence: string } };
	capability: { id: string; dataPolicy: Record<string, unknown> | null };
	privacyZdrOnly: boolean;
	privacyEnableInputOutputLogging: boolean;
	privacyEnablePaidMayTrain: boolean;
	privacyEnableFreeMayTrain: boolean;
}): { accessible: boolean; reasonCode: "available" | "zdr_required" | "data_policy_unknown" | "data_policy_unverified" | "logging_disabled" | "training_disabled" } {
	const policy = args.capability.dataPolicy;
	const stateful = ["batch", "files.upload", "files.list", "files.retrieve"].includes(args.capability.id);
	const tier = String(policy?.tier ?? (stateful ? "logs" : args.row.providerPolicy?.dataPolicyTier ?? "unknown"));
	const confidence = String(policy?.confidence ?? (stateful ? "confirmed" : args.row.providerPolicy?.dataPolicyConfidence ?? "unknown"));
	const zeroDataRetention = resolveEnforcedZdr(
		stateful ? false : args.row.providerPolicy?.zeroDataRetention,
		typeof policy?.zdrEligibility === "string" ? policy.zdrEligibility : null,
		typeof policy?.zeroDataRetention === "boolean" ? policy.zeroDataRetention : null,
	);

	if (args.privacyZdrOnly && zeroDataRetention !== true) {
		return { accessible: false, reasonCode: "zdr_required" };
	}
	const privacyRestricted = args.privacyZdrOnly || !args.privacyEnableInputOutputLogging || !args.privacyEnablePaidMayTrain || !args.privacyEnableFreeMayTrain;
	if (privacyRestricted && tier === "unknown") {
		return { accessible: false, reasonCode: "data_policy_unknown" };
	}
	if (privacyRestricted && confidence !== "confirmed") {
		return { accessible: false, reasonCode: "data_policy_unverified" };
	}
	if (!args.privacyEnableInputOutputLogging && tier === "logs") {
		return { accessible: false, reasonCode: "logging_disabled" };
	}
	if ((!args.privacyEnablePaidMayTrain && !args.privacyEnableFreeMayTrain) && tier === "trains") {
		return { accessible: false, reasonCode: "training_disabled" };
	}
	return { accessible: true, reasonCode: "available" };
}
