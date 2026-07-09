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

const mintlifyProxyOrigin = "https://aistats.mintlify.site";
const docsProxyRewrites = [
  {
    source: "/docs",
    destination: `${mintlifyProxyOrigin}/docs`,
  },
  {
    source: "/docs/:match*",
    destination: `${mintlifyProxyOrigin}/docs/:match*`,
  },
];

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
              '</.well-known/api-catalog>; rel="api-catalog"; type="application/linkset+json", <https://phaseo.app/docs/v1/api-reference/introduction>; rel="service-doc"; type="text/html", </.well-known/agent-skills/index.json>; rel="describedby"; type="application/json"',
          },
          {
            key: "Vary",
            value: "Accept",
          },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/announcements",
        destination: "/blog",
        permanent: true,
      },
      {
        source: "/announcements/:slug*",
        destination: "/blog/:slug*",
        permanent: true,
      },
      {
        source: "/how-ai-stats-calculates-model-pricing",
        destination: "/how-phaseo-calculates-model-pricing",
        permanent: true,
      },
      {
        source: "/how-ai-stats-measures-latency-throughput",
        destination: "/how-phaseo-measures-latency-throughput",
        permanent: true,
      },
      {
        source: "/how-ai-stats-normalises-ai-benchmarks",
        destination: "/how-phaseo-normalises-ai-benchmarks",
        permanent: true,
      },
      {
        source: "/how-ai-stats-tracks-provider-availability",
        destination: "/how-phaseo-tracks-provider-availability",
        permanent: true,
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
        ...docsProxyRewrites,
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
