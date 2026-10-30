// Experiment: real Next.js on Cloudflare Workers through OpenNext.
// Prerendered shells come from build-time static assets (read-only);
// everything dynamic renders per request.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

export default defineCloudflareConfig({
	incrementalCache: staticAssetsIncrementalCache,
	enableCacheInterception: false,
});
