// The protocol's crypto library reads globalThis.crypto when it loads, so this runs first (see protocol.ts). Hermes may
// lack crypto.getRandomValues; expo-crypto's is loaded only then, which also keeps it out of tests running on Node.
const scope = globalThis as { crypto?: { getRandomValues?: unknown } };
if (typeof scope.crypto?.getRandomValues !== "function") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- loaded only when missing, see above
  const { getRandomValues } = require("expo-crypto") as typeof import("expo-crypto");
  scope.crypto = Object.assign(scope.crypto ?? {}, { getRandomValues });
}
