// src/lib/byok/crypto.ts
import { randomBytes, createCipheriv, createDecipheriv, pbkdf2Sync } from "crypto";

type Encrypted = {
    ciphertextB64: string;
    ivB64: string;
    tagB64: string;
    keyVersion: number;
    fingerprintHex: string;
    prefix: string;
    suffix: string;
};

function decodeEnvKeyMaterial(value: string): Buffer {
    const raw = value.startsWith("base64:") ? value.slice(7) : value;
    return value.startsWith("base64:")
        ? Buffer.from(raw, "base64")
        : Buffer.from(raw, "utf8");
}

function getKey(version: number): Buffer {
    const active = Number(process.env.BYOK_ACTIVE_KEY_VERSION || "1");
    const v = version ?? active;
    const envVar = v === 1 ? process.env.BYOK_KMS_KEY_V1 : undefined;
    if (!envVar) throw new Error(`Missing BYOK_KMS_KEY_V${v}`);
    const key = Buffer.from(envVar.startsWith("base64:") ? envVar.slice(7) : envVar, "base64");
    if (key.length !== 32) throw new Error("BYOK key must be 32 bytes (AES-256)");
    return key;
}

function getFingerprintSalt(): Buffer {
    // Dedicated pepper is preferred; otherwise reuse existing BYOK key material.
    const explicitPepper = process.env.BYOK_FINGERPRINT_PEPPER;
    if (explicitPepper) return decodeEnvKeyMaterial(explicitPepper);

    const v1 = process.env.BYOK_KMS_KEY_V1;
    if (v1) return Buffer.from(v1.startsWith("base64:") ? v1.slice(7) : v1, "base64");

    return getKey(Number(process.env.BYOK_ACTIVE_KEY_VERSION || "1"));
}

export function fingerprintSecretHex(secret: string): string {
    // PBKDF2 makes offline cracking far more expensive than raw SHA-256.
    return pbkdf2Sync(secret, getFingerprintSalt(), 210_000, 32, "sha256").toString("hex");
}

export function encryptSecret(plaintext: string, keyVersion = Number(process.env.BYOK_ACTIVE_KEY_VERSION || "1")): Encrypted {
    if (!plaintext) throw new Error("Missing secret");
    const key = getKey(keyVersion);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    const prefix = plaintext.slice(0, 6);
    const suffix = plaintext.slice(-4);

    return {
        ciphertextB64: ct.toString("base64"),
        ivB64: iv.toString("base64"),
        tagB64: tag.toString("base64"),
        keyVersion,
        fingerprintHex: fingerprintSecretHex(plaintext),
        prefix,
        suffix,
    };
}

export function decryptSecret(row: {
    enc_value: Uint8Array | Buffer;
    enc_iv: Uint8Array | Buffer;
    enc_tag: Uint8Array | Buffer;
    key_version: number;
}): string {
    const key = getKey(row.key_version);
    const iv = Buffer.from(row.enc_iv);
    const tag = Buffer.from(row.enc_tag);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(Buffer.from(row.enc_value)), decipher.final()]);
    return pt.toString("utf8");
}
