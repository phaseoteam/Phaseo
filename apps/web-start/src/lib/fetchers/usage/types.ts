export type LifecycleSeverity = "fyi" | "notice" | "warning" | "critical";

export type DeprecationWarning = {
	modelId: string;
	modelName: string | null;
	organisationId: string | null;
	lastUsedAt: string | null;
	deprecationDate: string | null;
	retirementDate: string | null;
	deprecationDaysUntil: number | null;
	retirementDaysUntil: number | null;
	replacementModelId: string | null;
	previousModelId: string | null;
	countAsAlert: boolean;
	severity: LifecycleSeverity;
};
