"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { SubscriptionPlansMessages } from "@/i18n/subscription-plans";

interface RotatingPricingProps {
	locale: string;
	messages: Pick<SubscriptionPlansMessages["detail"], "usageBased" | "customPricing" | "monthlySuffix" | "quarterlySuffix" | "yearlySuffix" | "weeklySuffix" | "dailySuffix">;
	prices?: {
		price: number;
		currency: string;
		frequency: string;
	}[];
}

export default function RotatingPricing({ prices, locale, messages }: RotatingPricingProps) {
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

	const formatPrice = (
		price: number,
		currency: string,
		frequency: string
	) => {
		const frequencyAliases: Record<string, string> = {
			mo: "monthly",
			month: "monthly",
			monthly: "monthly",
			qtr: "quarterly",
			quarter: "quarterly",
			quarterly: "quarterly",
			yr: "yearly",
			year: "yearly",
			annual: "yearly",
			yearly: "yearly",
			week: "weekly",
			weekly: "weekly",
			day: "daily",
			daily: "daily",
		};
		const normalizedFrequency = frequencyAliases[frequency.trim().toLowerCase()] ?? frequency.trim().toLowerCase();
		if (normalizedFrequency === "usage") {
			return messages.usageBased;
		}
		if (normalizedFrequency === "custom") {
			return messages.customPricing;
		}

		const formatter = new Intl.NumberFormat(locale, {
			style: "currency",
			currency: currency,
			minimumFractionDigits: 0,
			maximumFractionDigits: 2,
		});

		const period =
			normalizedFrequency === "monthly"
				? messages.monthlySuffix
				: normalizedFrequency === "quarterly"
				? messages.quarterlySuffix
				: normalizedFrequency === "yearly"
				? messages.yearlySuffix
				: normalizedFrequency === "weekly"
				? messages.weeklySuffix
				: normalizedFrequency === "daily"
				? messages.dailySuffix
				: "";

		return `${formatter.format(price)}${period ? ` ${period}` : ""}`;
	};

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
					{formatPrice(
						currentPrice.price,
						currentPrice.currency,
						currentPrice.frequency
					)}
				</motion.div>
			</AnimatePresence>
		</div>
	);
}
