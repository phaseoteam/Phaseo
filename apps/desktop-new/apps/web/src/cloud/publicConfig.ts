import { relayClerkTokenOptions } from "@t3tools/shared/relayAuth";
import * as Schema from "effect/Schema";

export class CloudPublicConfigMissingError extends Schema.TaggedError<CloudPublicConfigMissingError>()(
  "CloudPublicConfigMissingError",
  {
    key: Schema.Literal("T3CODE_CLERK_JWT_TEMPLATE"),
  },
) {
  override get message(): string {
    return `${this.key} is not configured.`;
  }
}

export interface CloudPublicConfig {
  readonly clerkPublishableKey: string | null;
  readonly clerkJwtTemplate: string | null;
  readonly relayUrl: string | null;
  readonly relayTracing: {
    readonly tracesUrl: string | null;
    readonly tracesDataset: string | null;
    readonly tracesToken: string | null;
  };
}

export function trimNonEmpty(value: string | undefined): string | null {
  return value?.trim() || null;
}

export function resolveCloudPublicConfig(): CloudPublicConfig {
  return { clerkPublishableKey: null, clerkJwtTemplate: null, relayUrl: null, relayTracing: { tracesUrl: null, tracesDataset: null, tracesToken: null } };
}

export function resolveRelayTracingConfig() {
  const { relayTracing } = resolveCloudPublicConfig();
  return relayTracing.tracesUrl && relayTracing.tracesDataset && relayTracing.tracesToken
    ? {
        tracesUrl: relayTracing.tracesUrl,
        tracesDataset: relayTracing.tracesDataset,
        tracesToken: relayTracing.tracesToken,
      }
    : null;
}

export function hasCloudPublicConfig(): boolean {
  const config = resolveCloudPublicConfig();
  return Boolean(config.clerkPublishableKey && config.clerkJwtTemplate && config.relayUrl);
}

export function resolveRelayClerkTokenOptions() {
  const { clerkJwtTemplate } = resolveCloudPublicConfig();
  if (!clerkJwtTemplate) {
    throw new CloudPublicConfigMissingError({ key: "T3CODE_CLERK_JWT_TEMPLATE" });
  }
  return relayClerkTokenOptions(clerkJwtTemplate);
}
