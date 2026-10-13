"use client";

import { formatSubscriptionPrice, localizedSubscriptionPriceLabels, type SubscriptionPrice } from "@/lib/fetchers/subscription-plans/pricing";
import { useLocale, useTranslations } from "next-intl";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";

interface RotatingPricingProps {
	prices?: SubscriptionPrice[];
}

export default function RotatingPricing({ prices = [] }: RotatingPricingProps) {
	const format = useDisplayFormatters();
	const locale = useLocale();
	const terms = useTranslations("Common.ui.subscriptionCatalog");
	const status = useTranslations("Common.status");
	const pricing = useTranslations("Catalogue.modelDetail.sections");
	const labels = localizedSubscriptionPriceLabels(locale, { custom: pricing("customPricing"), usage: pricing("usageBased"), unknown: status("unknown"), from: terms("starting_at"), seat: terms("seat"), introductory: terms("introductory"), firstCycle: terms("first_billing_cycle"), cycleCount: terms("number_of_cycles") });
	const [currentIndex, setCurrentIndex] = useState(0);
	const priceCount = prices.length;

	useEffect(() => {
		if (priceCount <= 1) return;

		const interval = setInterval(() => {
			setCurrentIndex((prev) => (prev + 1) % priceCount);
		}, 5000); // Rotate every 5 seconds

		return () => clearInterval(interval);
	}, [priceCount]);


	if (!prices || prices.length === 0) {
		return null;
	}

	const currentPrice = prices[currentIndex] ?? prices[0];
	return (
		<div className="text-lg font-semibold leading-tight">
			<AnimatePresence mode="wait">
				<motion.div
					key={currentIndex}
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -10 }}
					transition={{ duration: 0.3 }}
				>
					{formatSubscriptionPrice(currentPrice, (amount, currency) => format.number(amount, { style: "currency", currency, notation: "standard", maximumFractionDigits: 8 }), labels)}
				</motion.div>
			</AnimatePresence>
		</div>
	);
}
