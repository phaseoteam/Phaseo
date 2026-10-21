// Wording matches the website's provider pages (messages/en-GB "policy*" keys).
const TRAINING_LABELS: Record<string, string> = {
  no_train: "Does not train on prompts",
  enterprise_no_train: "No training on enterprise plan",
  opt_out_available: "May train (opt-out available)",
  may_train: "May train on prompts",
  unknown: "No clear public training policy",
};

export function trainingLabel(policy: string | null | undefined) {
  return TRAINING_LABELS[policy ?? "unknown"] ?? TRAINING_LABELS.unknown!;
}

const REGION_LABELS: Record<string, string> = {
  global: "Global",
  us: "US",
  eu: "EU",
  uk: "UK",
  apac: "Asia-Pacific",
  ap: "Asia-Pacific",
  jp: "Japan",
  au: "Australia",
  sg: "Singapore",
  nl: "Netherlands",
  fr: "France",
};

/** "us, EU, eu-north1" → "US, EU, EU-NORTH1": named where known, upper-cased otherwise, without repeats. */
export function regionsLabel(regions: string[] | null | undefined) {
  const labels = (regions ?? []).map((region) => REGION_LABELS[region.toLowerCase()] ?? region.toUpperCase());
  return labels.length ? [...new Set(labels)].join(", ") : undefined;
}
