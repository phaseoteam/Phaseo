import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import { resolveUserDataPath } from "./DesktopUserData.ts";
it.effect("uses independent Phaseo development and production profiles", () =>
  Effect.gen(function* () {
    const development = yield* resolveUserDataPath({ appDataDirectory: "/profiles", isDevelopment: true, platform: "win32" });
    const production = yield* resolveUserDataPath({ appDataDirectory: "/profiles", isDevelopment: false, platform: "win32" });
    assert.match(development, /phaseo-desktop-new-dev$/);
    assert.match(production, /phaseo-desktop-new$/);
    assert.notEqual(development, production);
    assert.ok(!development.includes("t3code"));
  }).pipe(Effect.provide(NodeServices.layer)),
);
