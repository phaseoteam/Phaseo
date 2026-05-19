import type { ProfileSnapshot } from "./fetchers/profile/getProfileSnapshot"
import { absoluteUrl } from "./seo"

export const PROFILE_SHARE_CARD_VERSION = "20260512b"

export type ProfileShareCardPayload = {
	displayName: string
	workspaceName: string | null
	memberSinceLabel: string
	totalRequests: number
	totalTokens: number
	longestStreak: number
	avgPerWeek: number
}

type ProfileShareCardTokenPayload = {
	n: string
	w?: string
	j: string
	r: number
	t: number
	s: number
	a: number
}

function clampText(value: string, maxLength: number): string {
	return value.trim().slice(0, maxLength)
}

function toTokenPayload(payload: ProfileShareCardPayload): ProfileShareCardTokenPayload {
	return {
		n: clampText(payload.displayName, 80) || "AI Stats User",
		...(payload.workspaceName?.trim()
			? { w: clampText(payload.workspaceName, 48) }
			: {}),
		j: clampText(payload.memberSinceLabel, 24) || "Recently",
		r: Math.max(0, Math.round(payload.totalRequests)),
		t: Math.max(0, Math.round(payload.totalTokens)),
		s: Math.max(0, Math.round(payload.longestStreak)),
		a: Math.max(0, Math.round(payload.avgPerWeek * 10) / 10),
	}
}

function fromTokenPayload(payload: Partial<ProfileShareCardTokenPayload>): ProfileShareCardPayload {
	return {
		displayName: clampText(payload.n ?? "AI Stats User", 80) || "AI Stats User",
		workspaceName: clampText(payload.w ?? "", 48) || null,
		memberSinceLabel: clampText(payload.j ?? "Recently", 24) || "Recently",
		totalRequests: Math.max(0, Math.round(Number(payload.r ?? 0) || 0)),
		totalTokens: Math.max(0, Math.round(Number(payload.t ?? 0) || 0)),
		longestStreak: Math.max(0, Math.round(Number(payload.s ?? 0) || 0)),
		avgPerWeek: Math.max(0, Number(payload.a ?? 0) || 0),
	}
}

function encodeBase64UrlUtf8(value: string): string {
	if (typeof Buffer !== "undefined") {
		return Buffer.from(value, "utf8")
			.toString("base64")
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=+$/g, "")
	}

	return btoa(unescape(encodeURIComponent(value)))
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "")
}

function decodeBase64UrlUtf8(value: string): string {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/")
	const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")

	if (typeof Buffer !== "undefined") {
		return Buffer.from(padded, "base64").toString("utf8")
	}

	return decodeURIComponent(escape(atob(padded)))
}

export function buildProfileShareCardPayload(
	profile: ProfileSnapshot,
): ProfileShareCardPayload {
	return {
		displayName: profile.displayName,
		workspaceName: profile.workspaceName,
		memberSinceLabel: new Date(profile.memberSince).toLocaleDateString("en", {
			month: "short",
			year: "numeric",
		}),
		totalRequests: profile.totalRequests,
		totalTokens: profile.totalTokens,
		longestStreak: profile.longestStreak,
		avgPerWeek: profile.avgPerWeek,
	}
}

export function serializeProfileShareCardToken(
	payload: ProfileShareCardPayload,
): string {
	return encodeBase64UrlUtf8(JSON.stringify(toTokenPayload(payload)))
}

export function parseProfileShareCardToken(token: string): ProfileShareCardPayload {
	try {
		const parsed = JSON.parse(
			decodeBase64UrlUtf8(token),
		) as Partial<ProfileShareCardTokenPayload>
		return fromTokenPayload(parsed)
	} catch {
		return fromTokenPayload({})
	}
}

export function buildProfileShareCardImageUrl(
	payload: ProfileShareCardPayload,
): string {
	return absoluteUrl(
		`/og/profile-share/${serializeProfileShareCardToken(payload)}?v=${PROFILE_SHARE_CARD_VERSION}`,
	)
}

export function buildProfileShareCardPageUrl(
	payload: ProfileShareCardPayload,
): string {
	return absoluteUrl(`/share/profile/${serializeProfileShareCardToken(payload)}`)
}

export function buildProfileShareCopy(): string {
	return "My AI Stats share card"
}
