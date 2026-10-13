"use client";

import { formatSubscriptionPrice, type SubscriptionPrice } from "@/lib/fetchers/subscription-plans/pricing";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { SubscriptionPlansMessages } from "@/i18n/subscription-plans";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";

interface RotatingPricingProps {
	locale: string;
	messages: Pick<SubscriptionPlansMessages["detail"], "usageBased" | "customPricing" | "monthlySuffix" | "quarterlySuffix" | "yearlySuffix" | "weeklySuffix" | "dailySuffix">;
	prices?: SubscriptionPrice[];
}

export default function RotatingPricing({ prices, locale, messages }: RotatingPricingProps) {
	const format = useDisplayFormatters();
	const [currentIndex, setCurrentIndex] = useState(0);
	const priceCount = prices?.length ?? 0;

	useEffect(() => {
		if (priceCount <= 1) return;

		const interval = setInterval(() => {
			setCurrentIndex((prev) => (prev + 1) % priceCount);
		}, 5000);

		return () => clearInterval(interval);
	}, [priceCount]);

	if (!prices || prices.length === 0) {
		return null;
	}

	const currentPrice = prices[currentIndex] ?? prices[0];

	const formattedPrice = formatSubscriptionPrice(currentPrice, (amount, currency) => format.number(amount, { style: "currency", currency, notation: "standard", maximumFractionDigits: 2 }), { custom: messages.customPricing, usage: messages.usageBased, unknown: "Price unavailable" });

	return (
		<div className="text-2xl font-bold text-primary">
			<AnimatePresence mode="wait">
				<motion.div
					key={currentIndex}
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -10 }}
					transition={{ duration: 0.3 }}
				>
					{formattedPrice}
				</motion.div>
			</AnimatePresence>
		</div>
	);
}
