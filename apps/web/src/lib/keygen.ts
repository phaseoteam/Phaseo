// src/lib/gateway/keygen.ts
import crypto from "crypto";

const BASE62 = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function rand62(n: number) {
    // Uses crypto.randomBytes for secure randomness
    const bytes = crypto.randomBytes(n);
    let out = "";
    for (let i = 0; i < n; i++) {
        out += BASE62[bytes[i] % 62];
    }
    return out;
}

export function makeKeyV2() {
    const kid = rand62(12);
    const secret = rand62(40);
    const plaintext = `phaseo_v1_sk_${kid}_${secret}`;
    const prefix = kid.slice(0, 6);
    return { kid, secret, plaintext, prefix };
}

export function makeManagementKeyV1() {
    const kid = rand62(12);
    const secret = rand62(40);
    const plaintext = `phaseo_v1_mk_${kid}_${secret}`;
    const prefix = kid.slice(0, 6);
    return { kid, secret, plaintext, prefix };
}

export function hmacSecret(secret: string, pepper: string) {
    return crypto.createHmac("sha256", pepper).update(secret).digest("hex");
}

export function hashOAuthClientSecret(secret: string): string {
    const pepper = String(
        process.env.PHASEO_OAUTH_TOKEN_PEPPER ??
        process.env.KEY_PEPPER_ACTIVE ??
        process.env.KEY_PEPPER ??
        "",
    ).trim();
    if (!pepper) {
        throw new Error("PHASEO_OAUTH_TOKEN_PEPPER or KEY_PEPPER_ACTIVE is not set");
    }
    return crypto.createHmac("sha256", pepper).update(secret, "utf8").digest("base64url");
}
