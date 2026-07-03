import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const monorepoRoot = path.join(__dirname, "..", "..");

// Skip remote font downloads in offline or locked-down environments so builds don't fail.
process.env.NEXT_FONT_IGNORE_FAILED_DOWNLOADS ||= "true";

const configuredAllowedDevOrigins =
  process.env.NEXT_ALLOWED_DEV_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

/** @type {import("next").NextConfig} */
const nextConfig = {
  ...(configuredAllowedDevOrigins.length > 0
    ? { allowedDevOrigins: configuredAllowedDevOrigins }
    : {}),
  cacheComponents: true,
  env: {
    NEXT_PUBLIC_DEPLOY_TIME:
      process.env.NEXT_PUBLIC_DEPLOY_TIME ?? new Date().toISOString(),
  },
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
  experimental: {
    turbopackFileSystemCacheForDev: true,
  },
  async headers() {
    return [
      {
        source: "/",
        headers: [
          {
            key: "Link",
            value:
              '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json", <https://docs.ai-stats.phaseo.app/v1/api-reference/introduction>; rel="service-doc"; type="text/html", </.well-known/agent-skills/index.json>; rel="describedby"; type="application/json"',
          },
          {
            key: "Vary",
            value: "Accept",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: "/.well-known/agent-skills/index.json",
          destination: "/.well-known/agent-skills",
        },
      ],
      afterFiles: [
        {
          source: "/ingest/static/:path*",
          destination: "https://eu-assets.i.posthog.com/static/:path*",
        },
        {
          source: "/ingest/:path*",
          destination: "https://eu.i.posthog.com/:path*",
        },
      ],
    };
  },
};

export default nextConfig;
