export interface GuardrailUpdateRequest {
  allowedApiModelIds?: string[];
  description?: string | null;
  enabled?: boolean;
  modelRestrictionMode?: "none" | "allowlist" | "blocklist";
  name?: string;
  privacyEnableFreeMayPublishPrompts?: boolean | null;
  privacyEnableFreeMayTrain?: boolean | null;
  privacyEnableInputOutputLogging?: boolean | null;
  privacyEnablePaidMayTrain?: boolean | null;
  privacyZdrOnly?: boolean | null;
  promptInjectionAction?: "flag" | "block";
  promptInjectionEnabled?: boolean;
  providerRestrictionEnforceAllowed?: boolean;
  providerRestrictionMode?: "none" | "allowlist" | "blocklist";
  providerRestrictionProviderIds?: string[];
  sensitiveInfoDefaultAction?: "flag" | "redact" | "block";
  sensitiveInfoEnabled?: boolean;
  sensitiveInfoRules?: {
    [key: string]: unknown;
  }[];
}
