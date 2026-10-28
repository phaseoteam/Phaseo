import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withPostHogConfig } from "@posthog/nextjs-config";
import createNextIntlPlugin from "next-intl/plugin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const monorepoRoot = path.join(__dirname, "..", "..");
const withNextIntl = createNextIntlPlugin({
  requestConfig: "./src/i18n/request.ts",
  experimental: {
    createMessagesDeclaration: "./messages/en-GB/auth.json",
  },
});

// Skip remote font downloads in offline or locked-down environments so builds don't fail.
process.env.NEXT_FONT_IGNORE_FAILED_DOWNLOADS ||= "true";

const configuredAllowedDevOrigins =
  process.env.NEXT_ALLOWED_DEV_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

const mintlifyProxyOrigin = "https://aistats.mintlify.site";
const configuredWebApiOrigin = process.env.WEB_API_ORIGIN?.trim().replace(/\/$/, "");
const legacyAiStatsHost = ["ai-stats", "phaseo", "app"].join(".");
// Cloudflare owns /api/_web on phaseo.app, but Vercel preview deployments need
// an explicit rewrite so browser-side same-origin fetches reach that API.
const webApiOrigin =
  configuredWebApiOrigin ||
  (process.env.VERCEL_ENV === "preview" || process.env.NODE_ENV === "development"
    ? "https://phaseo.app"
    : "");
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
  // Partial Prerendering comes from cacheComponents. `partialPrefetching` stays
  // off: it re-renders every dynamic page as a runtime prefetch and embeds that
  // copy in the response, and links here only prefetch static shells on intent.
  // Set explicitly: Next 16.4 warns when it's unset, and the default may flip.
  cacheComponents: true,
  partialPrefetching: false,
  // `pnpm run build` type-checks with TypeScript 7 first (`pnpm run typecheck`,
  // incremental in .next/cache like Next's own check). Next's check would run the
  // `typescript` package's CLI, which is the TypeScript 6 package kept for
  // typescript-eslint (pnpm-workspace.yaml).
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    globalNotFound: true,
  },
  transpilePackages: [
    "@phaseo/app-kit",
    "@formatjs/fast-memoize",
    "@formatjs/intl-localematcher",
    "@formatjs/icu-messageformat-parser",
    "@formatjs/icu-skeleton-parser",
    "intl-messageformat",
    "next-intl",
    "use-intl",
  ],
  images: {
    qualities: [75, 90],
  },
  env: {
    NEXT_PUBLIC_DEPLOY_TIME:
      process.env.NEXT_PUBLIC_DEPLOY_TIME ?? new Date().toISOString(),
    NEXT_PUBLIC_RELEASE:
      process.env.NEXT_PUBLIC_RELEASE ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.CF_PAGES_COMMIT_SHA ??
      "development",
  },
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            // Chat can be entered through client navigation from any page. Allow
            // this origin to request the user's microphone permission; cross-origin
            // frames remain blocked and the browser still requires user consent.
            value: "camera=(), microphone=(self), geolocation=(), payment=(self)",
          },
        ],
      },
      {
        // Client dictionaries are named by their content, so a file never changes.
        source: "/_i18n/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/:locale(en-GB|en-US|es-ES|fr-FR|de-DE|pt-BR|ja|zh-Hans|hi|ar-SA)?/oauth/consent",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; img-src 'self' data:",
          },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
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
        source: "/:path*",
        has: [{ type: "host", value: "ai-stats.vercel.app" }],
        destination: "https://phaseo.app/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: "docs.phaseo.app" }],
        destination: "https://phaseo.app/docs/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [{ type: "host", value: `docs.${legacyAiStatsHost}` }],
        destination: "https://phaseo.app/docs/:path*",
        permanent: true,
      },
      {
        source: "/models/:organisation/:model/pricing",
        destination: "/models/:organisation/:model#pricing",
        permanent: true,
      },
      {
        source: "/models/:organisation/:model/gateway",
        destination: "/models/:organisation/:model",
        permanent: true,
      },
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
        source: "/updates/web",
        destination: "/updates/models",
        permanent: true,
      },
      {
        source: "/updates/youtube",
        destination: "/updates/models",
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
      {
        source: "/status",
        destination: "https://status.phaseo.app",
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
        ...(webApiOrigin
          ? [
              {
                source: "/api/_web/:path*",
                destination: `${webApiOrigin}/api/_web/:path*`,
              },
              {
                source: "/api/account/:path*",
                destination: `${webApiOrigin}/api/account/:path*`,
              },
              {
                source: "/api/chat/:path*",
                destination: `${webApiOrigin}/api/chat/:path*`,
              },
              {
                source: "/api/internal/:path*",
                destination: `${webApiOrigin}/api/internal/:path*`,
              },
            ]
          : []),
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

// Source maps for PostHog error tracking. Production builds with the upload
// credentials emit browser source maps, inject chunk IDs into the browser
// chunks, upload the maps to PostHog for this commit, then delete them and
// their sourceMappingURL comments, so the deployment never serves or points to
// them. Builds without the credentials (local, preview, forks) are unchanged.
const posthogSourceMapApiKey = process.env.POSTHOG_SOURCEMAPS_API_KEY?.trim();
const posthogSourceMapProjectId = process.env.POSTHOG_SOURCEMAPS_PROJECT_ID?.trim();
const uploadPostHogSourceMaps =
  Boolean(posthogSourceMapApiKey && posthogSourceMapProjectId) &&
  process.env.VERCEL_ENV !== "preview";

const sourceMapComment =
  /\n?(?:\/\/# sourceMappingURL=[^\s]+\.map|\/\*# sourceMappingURL=[^\s*]+\.map[ \t]*\*\/)[ \t]*(?=\n?$)/;

async function removeSourceMaps(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const file = path.join(entry.parentPath, entry.name);
        if (entry.name.endsWith(".map")) {
          await rm(file, { force: true });
        } else if (/\.(?:js|css)$/.test(entry.name)) {
          const content = await readFile(file, "utf8");
          const stripped = content.replace(sourceMapComment, "");
          if (stripped !== content) await writeFile(file, stripped);
        }
      }),
  );
}

function withPostHogSourceMaps(config) {
  if (!uploadPostHogSourceMaps) return config;

  const posthogConfig = withPostHogConfig(config, {
    personalApiKey: posthogSourceMapApiKey,
    projectId: posthogSourceMapProjectId,
    host: process.env.POSTHOG_SOURCEMAPS_HOST?.trim() || "https://eu.posthog.com",
    sourcemaps: {
      releaseName: "phaseo-web",
      releaseVersion: nextConfig.env.NEXT_PUBLIC_RELEASE,
      // Chunk IDs injected into the bundles. The "event" mode needs a newer
      // posthog-js than this app runs.
      releaseMode: "symbol-set",
      deleteAfterUpload: true,
    },
  });

  return async (phase, context) => {
    const resolved = await posthogConfig(phase, context);
    const upload = resolved.compiler?.runAfterProductionCompile;
    if (!upload) return resolved;
    return {
      ...resolved,
      compiler: {
        ...resolved.compiler,
        // Only browser chunks: server maps stay as Next writes them. A failed
        // upload logs a warning and the build continues without public maps.
        runAfterProductionCompile: async (build) => {
          const browserChunks = path.resolve(build.distDir, "static");
          try {
            await upload({ ...build, distDir: browserChunks });
          } catch (error) {
            console.warn("[posthog] Source map upload failed; deleting the maps instead.", error);
          }
          await removeSourceMaps(browserChunks);
        },
      },
    };
  };
}

export default withPostHogSourceMaps(withNextIntl(nextConfig));
