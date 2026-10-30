"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";

type CreditsBalanceResponse = {
	initialBalance?: number | null;
};

function formatCreditsBalance(
	value: number | null,
	formatNumber: ReturnType<typeof useDisplayFormatters>["number"]
) {
	if (value === null || !Number.isFinite(value)) return null;
	return formatNumber(value, {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
		notation: "standard",
	});
}

export function useChatCredits(userId?: string) {
	const format = useDisplayFormatters();
	const [balance, setBalance] = useState<number | null>(null);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!userId) {
			setBalance(null);
			setLoading(false);
			return;
		}

		let active = true;
		const controller = new AbortController();
		const timeoutId = window.setTimeout(() => controller.abort(), 8000);
		setLoading(true);
		createClient().auth.getSession()
			.then(({ data }) => {
				const accessToken = data.session?.access_token;
				if (!accessToken) throw new Error("Credits request requires a session");
				return fetch("/api/account/credits/balance", {
					headers: {
						accept: "application/json",
						authorization: `Bearer ${accessToken}`,
					},
					signal: controller.signal,
				});
			})
			.then(async (response) => {
				if (!response.ok) throw new Error(`Credits request failed: ${response.status}`);
				return (await response.json()) as CreditsBalanceResponse;
			})
			.then((data) => {
				if (!active) return;
				const rawBalance = data.initialBalance;
				const nextBalance =
					rawBalance === null || rawBalance === undefined
						? null
						: Number(rawBalance);
				setBalance(
					nextBalance !== null && Number.isFinite(nextBalance)
						? nextBalance
						: null,
				);
			})
			.catch((error) => {
				if (active && (error as Error).name !== "AbortError") setBalance(null);
			})
			.finally(() => {
				window.clearTimeout(timeoutId);
				if (active) setLoading(false);
			});

		return () => {
			active = false;
			window.clearTimeout(timeoutId);
			controller.abort();
		};
	}, [userId]);

	return {
		creditsLabel: formatCreditsBalance(balance, format.number),
		creditsLoading: loading,
	};
}
