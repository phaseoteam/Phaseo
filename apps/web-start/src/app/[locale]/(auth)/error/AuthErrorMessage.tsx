"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { englishAuthMessages } from "@/i18n/default-messages";
import {
	type AuthErrorCode,
	normalizeAuthErrorCode,
	normalizeAuthErrorMessage,
	resolveHashAuthErrorCode,
} from "@/lib/auth/errorMessage";

type AuthErrorMessageProps = {
	initialCode?: string | null;
	initialMessage?: string | null;
};

type AuthErrorMessageKey = keyof typeof englishAuthMessages.Auth.error;

const authErrorEntries = Object.entries(
	englishAuthMessages.Auth.error,
) as Array<[AuthErrorMessageKey, string]>;

const authErrorCodeKeys: Record<AuthErrorCode, AuthErrorMessageKey> = {
	default: "default",
	"expired-link": "expiredLink",
	"sso-not-configured": "ssoNotConfigured",
	"sso-disabled": "ssoDisabled",
	"sso-managed": "ssoManaged",
	cancelled: "cancelled",
	"workspace-setup": "workspaceSetup",
};

function resolveMessageKey(message: string | null | undefined): AuthErrorMessageKey {
	const normalizedMessage = normalizeAuthErrorMessage(message);
	return (
		authErrorEntries.find(([, value]) => value === normalizedMessage)?.[0] ??
		"default"
	);
}

function subscribeToHashChange(onStoreChange: () => void): () => void {
	window.addEventListener("hashchange", onStoreChange);
	return () => window.removeEventListener("hashchange", onStoreChange);
}

function getHashSnapshot(): string {
	return window.location.hash;
}

function getServerHashSnapshot(): string {
	return "";
}

export default function AuthErrorMessage({
	initialCode,
	initialMessage,
}: AuthErrorMessageProps) {
	const t = useTranslations("Auth.error");
	const fallbackKey = useMemo(
		() =>
			initialCode
				? authErrorCodeKeys[normalizeAuthErrorCode(initialCode)]
				: resolveMessageKey(initialMessage),
		[initialCode, initialMessage],
	);
	const hash = useSyncExternalStore(
		subscribeToHashChange,
		getHashSnapshot,
		getServerHashSnapshot,
	);
	const messageKey = useMemo(() => {
		const hashCode = resolveHashAuthErrorCode(hash);
		return hashCode ? authErrorCodeKeys[hashCode] : fallbackKey;
	}, [fallbackKey, hash]);

	return <>{t(messageKey)}</>;
}
