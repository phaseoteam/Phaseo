import crypto from "crypto";
import { hashOAuthClientSecret, makeManagementKeyV1 } from "./keygen";

describe("dashboard key generation", () => {
	const previousActivePepper = process.env.KEY_PEPPER_ACTIVE;
	const previousLegacyPepper = process.env.KEY_PEPPER;
	const previousOAuthPepper = process.env.PHASEO_OAUTH_TOKEN_PEPPER;

	afterEach(() => {
		if (previousActivePepper === undefined) delete process.env.KEY_PEPPER_ACTIVE;
		else process.env.KEY_PEPPER_ACTIVE = previousActivePepper;
		if (previousLegacyPepper === undefined) delete process.env.KEY_PEPPER;
		else process.env.KEY_PEPPER = previousLegacyPepper;
		if (previousOAuthPepper === undefined) delete process.env.PHASEO_OAUTH_TOKEN_PEPPER;
		else process.env.PHASEO_OAUTH_TOKEN_PEPPER = previousOAuthPepper;
	});

	it("uses the explicit management-key prefix", () => {
		const key = makeManagementKeyV1();
		expect(key.plaintext).toMatch(/^phaseo_v1_mk_[A-Za-z0-9]{12}_[A-Za-z0-9]{40}$/);
		expect(key.prefix).toBe(key.kid.slice(0, 6));
	});

	it("matches the gateway OAuth client-secret hash format", () => {
		process.env.PHASEO_OAUTH_TOKEN_PEPPER = "oauth-test-pepper";
		delete process.env.KEY_PEPPER_ACTIVE;
		delete process.env.KEY_PEPPER;
		const secret = "client-secret";
		const expected = crypto
			.createHmac("sha256", "oauth-test-pepper")
			.update(secret, "utf8")
			.digest("base64url");
		expect(hashOAuthClientSecret(secret)).toBe(expected);
	});
});
