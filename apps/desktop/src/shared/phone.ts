/**
 * Settings → Phone: what the window shows of phone access and Phaseo Connect. The server itself lives in
 * src/main/phone; the frames a phone speaks are in @phaseo/phone-protocol.
 */
export type PhoneAddressKind = "lan" | "tailscale-ip" | "tailscale-https";
export type PhoneAddress = {
	kind: PhoneAddressKind;
	/** The URL a phone uses, when the address exists on this computer now. */
	url?: string;
	enabled: boolean;
	/** Why it can't be used yet, in words. */
	note?: string;
};
/**
 * What one paired phone may do beyond its threads, switched per phone in Settings → Phone. Reading code is on unless
 * turned off; making changes and terminals stay off until turned on.
 */
export type PhoneAccess = { code: boolean; changes: boolean; terminal: boolean };
export const phoneAccessDefaults: PhoneAccess = { code: true, changes: false, terminal: false };
export const phoneAccessLabels: Record<keyof PhoneAccess, { title: string; description: string }> = {
	code: { title: "Read code", description: "Git status, changes, files and pull requests in each project and thread." },
	changes: { title: "Make changes", description: "Commit, push, pull and switch branches, start threads in new worktrees, and create, merge, review and comment on pull requests. Needs Read code. The window notes each change a phone makes." },
	terminal: { title: "Use terminals", description: "Open terminals and type in them. Not offered on the phone yet." },
};
export type PhoneDeviceView = { id: string; name: string; pairedAt: string; lastSeenAt?: string; connected: boolean; access: PhoneAccess };
/** Where Phaseo Connect stands. payment-due: switched off until an unpaid month is taken from credits. */
export type ConnectStatus = "off" | "signed-out" | "checking" | "connecting" | "connected" | "payment-due" | "error";
export type ConnectView = {
	status: ConnectStatus;
	enabled: boolean;
	/** The Phaseo sign-in it bills, by name or email. */
	account?: string;
	/** False when this person can see Connect but only owners and admins can switch it. */
	canManage?: boolean;
	/** Days it was on this month, what that comes to so far, and by the month's end if nothing changes. */
	daysOn?: number;
	chargeSoFarNanos?: number;
	estimatedNanos?: number;
	message?: string;
};
export type PhoneState = {
	enabled: boolean;
	running: boolean;
	port: number;
	error?: string;
	desktopName: string;
	addresses: PhoneAddress[];
	tailscale: { installed: boolean; /** The tailnet allows HTTPS certificates; null when the CLI doesn't say. */ httpsAvailable: boolean | null; serving: boolean; dnsName?: string };
	devices: PhoneDeviceView[];
	connect: ConnectView;
};
/** A pairing code to show: the phaseo://pair link and the QR code of it, one character per module ("1" dark). */
export type PhonePairingView = { link: string; qr: { size: number; modules: string }; expiresAt: string };
export type PhoneSettingsUpdate = { enabled?: boolean; addresses?: Partial<Record<PhoneAddressKind, boolean>> };

export function validatePhoneAccessUpdate(id: unknown, value: unknown): { id: string; access: Partial<PhoneAccess> } {
	if (typeof id !== "string" || !id || !value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid phone access.");
	const access: Partial<PhoneAccess> = {};
	for (const [key, enabled] of Object.entries(value)) {
		if (!(key in phoneAccessDefaults) || typeof enabled !== "boolean") throw new Error("Invalid phone access.");
		access[key as keyof PhoneAccess] = enabled;
	}
	return { id, access };
}

export const defaultPhonePort = 47_917;
/** $1 in the ledger's nanodollars. */
export const connectMonthlyPriceNanos = 1_000_000_000;
export const connectPriceText = "$1 a month from your Phaseo credits, charged for the days it's on";
export const phoneAddressLabels: Record<PhoneAddressKind, string> = { lan: "This Wi-Fi", "tailscale-ip": "Tailscale IP", "tailscale-https": "Tailscale HTTPS" };

export function validatePhoneSettingsUpdate(value: unknown): PhoneSettingsUpdate {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid phone settings.");
	const input = value as Record<string, unknown>, update: PhoneSettingsUpdate = {};
	if (input.enabled !== undefined) { if (typeof input.enabled !== "boolean") throw new Error("Invalid phone settings."); update.enabled = input.enabled; }
	if (input.addresses !== undefined) {
		const addresses = input.addresses;
		if (!addresses || typeof addresses !== "object" || Array.isArray(addresses)) throw new Error("Invalid phone settings.");
		update.addresses = {};
		for (const [key, enabled] of Object.entries(addresses)) {
			if (!(key in phoneAddressLabels) || typeof enabled !== "boolean") throw new Error("Invalid phone settings.");
			update.addresses[key as PhoneAddressKind] = enabled;
		}
	}
	return update;
}
