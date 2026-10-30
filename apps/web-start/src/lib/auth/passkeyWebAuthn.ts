type RegistrationOptionsJson = {
	challenge: string;
	excludeCredentials?: Array<{
		id: string;
		transports?: AuthenticatorTransport[];
		type?: PublicKeyCredentialType;
	}>;
	user: {
		id: string;
	};
	[key: string]: unknown;
};

export type SerializedRegistrationCredential = {
	authenticatorAttachment?: string;
	clientExtensionResults: AuthenticationExtensionsClientOutputs;
	id: string;
	rawId: string;
	response: {
		attestationObject: string;
		clientDataJSON: string;
	};
	type: "public-key";
};

function base64UrlToArrayBuffer(value: string): ArrayBuffer {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padded = normalized.padEnd(
		normalized.length + ((4 - (normalized.length % 4 || 4)) % 4),
		"=",
	);
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index);
	}
	return bytes.buffer;
}

function arrayBufferToBase64Url(value: ArrayBuffer): string {
	const bytes = new Uint8Array(value);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

export function parsePasskeyCreationOptions(
	input: unknown,
): PublicKeyCredentialCreationOptions {
	if (!isRecord(input) || typeof input.challenge !== "string") {
		throw new Error("Passkey creation options are invalid");
	}
	if (!isRecord(input.user) || typeof input.user.id !== "string") {
		throw new Error("Passkey user options are invalid");
	}

	const options = input as RegistrationOptionsJson;
	const nativeParser = (
		PublicKeyCredential as typeof PublicKeyCredential & {
			parseCreationOptionsFromJSON?: (
				options: RegistrationOptionsJson,
			) => PublicKeyCredentialCreationOptions;
		}
	).parseCreationOptionsFromJSON;
	if (typeof nativeParser === "function") {
		return (
			PublicKeyCredential as typeof PublicKeyCredential & {
				parseCreationOptionsFromJSON: (
					options: RegistrationOptionsJson,
				) => PublicKeyCredentialCreationOptions;
			}
		).parseCreationOptionsFromJSON(options);
	}

	return {
		...(options as unknown as PublicKeyCredentialCreationOptions),
		challenge: base64UrlToArrayBuffer(options.challenge),
		excludeCredentials: options.excludeCredentials?.map((credential) => ({
			...credential,
			id: base64UrlToArrayBuffer(credential.id),
			type: credential.type ?? "public-key",
		})),
		user: {
			...(options.user as unknown as PublicKeyCredentialUserEntity),
			id: base64UrlToArrayBuffer(options.user.id),
		},
	};
}

export function serializePasskeyRegistrationCredential(
	credential: PublicKeyCredential,
): SerializedRegistrationCredential {
	const credentialWithJson = credential as PublicKeyCredential & {
		authenticatorAttachment?: AuthenticatorAttachment | null;
		toJSON?: () => SerializedRegistrationCredential;
	};
	if (typeof credentialWithJson.toJSON === "function") {
		return credentialWithJson.toJSON() as SerializedRegistrationCredential;
	}

	const response = credential.response;
	if (
		!("attestationObject" in response) ||
		!(response.attestationObject instanceof ArrayBuffer)
	) {
		throw new Error("Passkey attestation response is invalid");
	}

	return {
		authenticatorAttachment:
			credentialWithJson.authenticatorAttachment ?? undefined,
		clientExtensionResults: credential.getClientExtensionResults(),
		id: credential.id,
		rawId: credential.id,
		response: {
			attestationObject: arrayBufferToBase64Url(
				response.attestationObject,
			),
			clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
		},
		type: "public-key",
	};
}
