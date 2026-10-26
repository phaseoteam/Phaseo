// Test helpers: sign OIDC-style tokens with throwaway keys.

export type TestSigner = { kid: string; alg: "RS256" | "ES256"; privateKey: CryptoKey; publicJwk: JsonWebKey };

export function base64Url(bytes: Uint8Array | string): string {
	const raw = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
	let binary = "";
	for (const byte of raw) binary += String.fromCharCode(byte);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function makeTestSigner(alg: "RS256" | "ES256", kid: string): Promise<TestSigner> {
	const pair = alg === "RS256"
		? await crypto.subtle.generateKey(
			{ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
			true,
			["sign", "verify"],
		) as CryptoKeyPair
		: await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
	const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey) as JsonWebKey;
	return { kid, alg, privateKey: pair.privateKey, publicJwk: { ...publicJwk, kid, alg, use: "sig" } as JsonWebKey };
}

export async function signTestToken(
	signer: TestSigner,
	payload: Record<string, unknown>,
	headerOverrides: Record<string, unknown> = {},
): Promise<string> {
	const header = base64Url(JSON.stringify({ typ: "JWT", alg: signer.alg, kid: signer.kid, ...headerOverrides }));
	const body = base64Url(JSON.stringify(payload));
	const input = new TextEncoder().encode(`${header}.${body}`);
	const algorithm = signer.alg === "RS256" ? { name: "RSASSA-PKCS1-v1_5" } : { name: "ECDSA", hash: "SHA-256" };
	const signature = new Uint8Array(await crypto.subtle.sign(algorithm, signer.privateKey, input));
	return `${header}.${body}.${base64Url(signature)}`;
}
