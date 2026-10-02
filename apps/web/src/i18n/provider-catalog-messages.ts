type Translator = { (key: never, values?: never): string };

const validationKeys: Record<string, string> = {
	"Expected up to eight pricing conditions.": "conditionsLimit",
	"Condition needs a valid path, operator, and value.": "conditionFields",
	"Use a scalar for eq, a non-empty list for in, or a number for range comparisons.": "conditionValue",
	"Catalog must be an object containing only the data array.": "catalogShape",
	"Expected a non-empty data array of models.": "modelsArray",
	"Each model must be an object.": "modelObject",
	"Unknown model field.": "unknownModelField",
	"Expected a string.": "string",
	"Expected a positive integer.": "positiveInteger",
	"Model id must use the publisher/model format.": "modelId",
	"Capability contains an unknown field.": "unknownCapabilityField",
	"Capability id is required and must be a simple endpoint identifier.": "capabilityId",
	"Expected an array of strings.": "stringsArray",
	"At least one capability or endpoint is required.": "capabilityRequired",
	"Invalid availability value.": "availability",
	"Expected an ISO 8601 timestamp with an explicit timezone (Z or ±HH:MM).": "timestamp",
	"Lifecycle timestamps must be in chronological order.": "lifecycleOrder",
	"Invalid pricing meter.": "pricingMeter",
	"Pricing meter fields are invalid.": "pricingFields",
	"Expected an array of pricing meters.": "pricingArray",
	"Catalog validation failed.": "validationFailed",
	"Automatically matched to an existing canonical model.": "automaticMatch"
};

export function localizedProviderCatalogMessage(message: string, t: Translator): string {
 const fixed = validationKeys[message];
 if (fixed) return t(("identity.catalogValidation." + fixed) as never);
 const patterns = [
  [/^Duplicate pricing meter: (.+)\.$/, "duplicateMeter", ["value"]],
  [/^Unknown pricing meter: (.+)\.$/, "unknownMeter", ["value"]],
  [/^Duplicate model id: (.+)\.$/, "duplicateModel", ["value"]],
  [/^Catalog contains (\d+) models; the limit is (\d+)\.$/, "modelsLimit", ["count", "limit"]],
  [/^Model strings must not exceed (\d+) characters\.$/, "stringLimit", ["limit"]],
 ] as const;
 for (const [pattern, key, names] of patterns) {
  const match = message.match(pattern);
  if (match) return t(("identity.catalogValidation." + key) as never, (Object.fromEntries(names.map((name, i) => [name, name === "value" ? match[i + 1] : Number(match[i + 1])]))) as never);
 }
 return t("identity.catalogValidation.fallback" as never);
}

type ProviderEvent = {
	event_type: string;
	title: string;
	message: string;
	payload: Record<string, unknown>;
};

export function localizedProviderEvent(event: ProviderEvent, t: Translator): { title: string; message: string } {
	const status = (value: string) => value === "paused"
		? t("providerReviewCopy.current.statusPaused" as never)
		: ["approved", "rejected", "needs_changes"].includes(value)
			? t(("identity.reviewStatus." + value) as never)
			: t("identity.reviewStatus.other" as never);
	const payload = event.payload ?? {};
	if (event.event_type === "provider_application_reviewed") {
		// Older application and claim events share one type; the persisted title distinguishes them.
		const isClaim = payload.applicationType === "claim" || event.title.startsWith("Provider claim ");
		const decision = typeof payload.decision === "string" ? payload.decision : "other";
		const subject = t((isClaim ? "identity.events.claim" : "identity.current.application") as never);
		const title = t("identity.events.reviewTitle" as never, ({ subject, decision: status(decision) }) as never);
		const reason = typeof payload.reason === "string" ? payload.reason : "";
		return { title, message: decision === "approved"
			? t((isClaim ? "identity.events.claimApproved" : "identity.events.applicationApproved") as never)
			: title + (reason ? ": " + reason : "") };
	}
	if (event.event_type === "catalog_applied" || event.event_type === "model_auto_approved") {
		const historic = event.message.match(/^(\d+) model claims were approved automatically; (\d+) new models need review\.$/)
			?? event.message.match(/^All (\d+) model claims matched the canonical catalog and were staged for probes\.$/);
		const approved = typeof payload.approved === "number" ? payload.approved : historic ? Number(historic[1]) : null;
		const pending = typeof payload.pending === "number" ? payload.pending : historic?.[2] ? Number(historic[2]) : 0;
		return { title: t((event.event_type === "catalog_applied" ? "identity.events.synced" : "identity.events.approved") as never),
			message: approved === null ? t("identity.events.unavailable" as never)
				: t((event.event_type === "catalog_applied" ? "identity.events.syncSummary" : "identity.events.approvedSummary") as never, ({ approved, pending }) as never) };
	}
	if (["model_approved", "model_rejected", "model_needs_changes"].includes(event.event_type)) {
		const decision = event.event_type.slice("model_".length);
		const historic = decision === "approved"
			? event.message.match(/^(.+) was approved and staged for endpoint checks\.$/)
			: event.message.match(/^([^:]+): ([\s\S]*)$/);
		const model = typeof payload.modelSlug === "string" ? payload.modelSlug : historic?.[1];
		const reason = typeof payload.reason === "string" ? payload.reason : historic?.[2];
		return { title: t("identity.events.reviewTitle" as never, ({ subject: t("strings.Model" as never), decision: status(decision) }) as never),
			message: model ? decision === "approved" ? t("identity.events.modelApproved" as never, ({ model }) as never) : model + (reason ? ": " + reason : "")
				: t("identity.events.unavailable" as never) };
	}
	if (event.event_type === "catalog_needs_changes") {
		const failed = event.title === "Catalog sync failed";
		return { title: t((failed ? "identity.events.syncFailed" : "identity.events.needsChanges") as never),
			message: failed ? t("identity.events.syncFailed" as never) : localizedProviderCatalogMessage(event.message, t) };
	}
	return { title: t("identity.events.update" as never), message: t("identity.events.unavailable" as never) };
}
