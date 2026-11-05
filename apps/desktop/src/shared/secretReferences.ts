/** A value read from a password manager or the environment at launch instead of being saved: op://vault/item/field or env:NAME. */
export const isSecretReference = (value: string) => /^op:\/\/[^/\n]+\/[^/\n]+\/[^\n]+$/.test(value) || /^env:[A-Za-z_][A-Za-z0-9_]*$/.test(value);

export const secretReferenceHint = "A value, or a reference read when it is used: op://vault/item/field for 1Password (with its op CLI signed in) or env:NAME for this computer's environment.";
