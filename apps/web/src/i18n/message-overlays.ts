import type { AuthMessages } from "./default-messages";

export type MessageOverlay<T> = T extends string
	? string
	: T extends Record<string, unknown>
		? { [Key in keyof T]?: MessageOverlay<T[Key]> }
		: never;

export type AuthMessageOverlay = MessageOverlay<AuthMessages>;

function isMessageObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Convert legacy dotted sentence keys to the nested paths next-intl expects. */
export function nestDottedMessageKeys<T>(messages: T): T {
	return nestDottedMessageObject(messages) as T;
}

function nestDottedMessageObject(
	messages: unknown,
	preserveKeys = false,
): unknown {
	if (!isMessageObject(messages)) return messages;

	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(messages)) {
		const normalizedValue = isMessageObject(value)
			? nestDottedMessageObject(value, preserveKeys || key === "strings")
			: value;
		const path = preserveKeys ? [key] : key.split(".");
		let current = result;

		for (const segment of path.slice(0, -1)) {
			const existing = current[segment];
			if (existing !== undefined && !isMessageObject(existing)) {
				throw new Error(`Conflicting dotted translation key: ${key}`);
			}
			if (existing === undefined) current[segment] = {};
			current = current[segment] as Record<string, unknown>;
		}

		const leaf = path[path.length - 1]!;
		if (current[leaf] !== undefined) {
			throw new Error(`Conflicting dotted translation key: ${key}`);
		}
		current[leaf] = normalizedValue;
	}

	return result;
}

export function mergeMessages(
	base: AuthMessages,
	overlay: AuthMessageOverlay,
): AuthMessages {
	return mergeCatalogMessages(base, overlay);
}

/** Merge a locale overlay without mutating the source catalog. */
export function mergeCatalogMessages<T>(base: T, overlay: unknown): T {
	function mergeValue(baseValue: unknown, overlayValue: unknown): unknown {
		if (typeof overlayValue === "string") return overlayValue;
		if (!isMessageObject(baseValue) || !isMessageObject(overlayValue)) {
			return baseValue;
		}

		return Object.fromEntries(
			Object.entries(baseValue).map(([key, value]) => [
				key,
				mergeValue(value, overlayValue[key]),
			]),
		);
	}

	return mergeValue(base, overlay) as T;
}
