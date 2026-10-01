import { expect, it } from "vitest";
import { keyDisplayData } from "./settings-key-display";

it("only returns key display metadata, never credential material or future columns", () => {
	expect(keyDisplayData({ id: "key", name: "Production", prefix: "ph_", scopes: ["read"],
		hash: "hash", key_hash: "hash", plaintext: "secret", encrypted_key: "secret", future_secret: "secret",
	})).toEqual({ id: "key", name: "Production", prefix: "ph_", scopes: ["read"] });
});
