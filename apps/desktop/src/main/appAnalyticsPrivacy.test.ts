import { gunzipSync } from "node:zlib";
import { PostHog } from "posthog-node";
import { expect, it } from "vitest";
import { filterAppEvent, privateException } from "@phaseo/app-kit/app-analytics";

it("the real SDK sends code locations without private error content", async () => {
  const batches: { batch: { properties: Record<string, unknown> }[] }[] = [];
  const client = new PostHog("public-project-key", {
    enableExceptionAutocapture: false, disableGeoip: true, fetchRetryCount: 0,
    before_send: filterAppEvent,
    fetch: async (_url, options) => {
      const bytes = Buffer.from(await new Response(options.body as BodyInit).arrayBuffer());
      const body = bytes[0] === 31 && bytes[1] === 139 ? gunzipSync(bytes).toString() : bytes.toString();
      batches.push(JSON.parse(body));
      return { status: 200, text: async () => "{}", json: async () => ({}) };
    },
  });
  try {
    const cause = new RangeError("sentinel-private-cause");
    cause.stack = "RangeError: sentinel-private-cause\n at calculate (/sentinel-private-path/worker.js:5:2)";
    const error = new TypeError("sentinel-private-prompt", { cause });
    error.stack = "TypeError: sentinel-private-prompt\n at privateFunction (C:\\Users\\sentinel-private-user\\index.js:42:7)";
    client.captureException(privateException(error), "anonymous-installation", { app_surface: "desktop", $process_person_profile: false });
    await client.flush();
    expect(batches).toHaveLength(1);
    expect(JSON.stringify(batches)).not.toContain("sentinel-private");
    expect(batches[0]!.batch[0]!.properties.$exception_list).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "TypeError", stacktrace: { frames: [expect.objectContaining({ filename: "app:///index.js", lineno: 42, colno: 7 })] } }),
      expect.objectContaining({ type: "RangeError", stacktrace: { frames: [expect.objectContaining({ filename: "app:///worker.js", lineno: 5, colno: 2 })] } }),
    ]));
  } finally { await client.shutdown(1000); }
});
