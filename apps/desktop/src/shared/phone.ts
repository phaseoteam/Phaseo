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
export type PhoneDeviceView = { id: string; name: string; pairedAt: string; lastSeenAt?: string; connected: boolean };
/** Where Phaseo Connect stands. paused: on, but switched off until an unpaid month is settled. */
export type ConnectStatus = "off" | "signed-out" | "checking" | "connecting" | "connected" | "paused" | "error";
export type ConnectView = {
	status: ConnectStatus;
	enabled: boolean;
	/** The Phaseo sign-in it bills, by name or email. */
	account?: string;
	/** Days it was on this month, and what that comes to so far. */
	daysOn?: number;
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
