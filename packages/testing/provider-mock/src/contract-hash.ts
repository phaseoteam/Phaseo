import { createHash } from "node:crypto";

export function getCanonicalBundleHash(bundle: Uint8Array): string {
	const canonicalBundle = new TextDecoder().decode(bundle).replace(/\r\n/g, "\n");
	return createHash("sha256").update(canonicalBundle, "utf8").digest("hex");
}
