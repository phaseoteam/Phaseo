"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";

interface RotatingPricingProps {
	prices?: {
		price: number;
		currency: string;
		frequency: string;
	}[];
}

export default function RotatingPricing({ prices }: RotatingPricingProps) {
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

	const formatPrice = (
		price: number,
		currency: string,
		frequency: string
	) => {
		const normalizedFrequency = frequency.toLowerCase();
		if (normalizedFrequency === "usage") {
			return "Usage-based";
		}
		if (normalizedFrequency === "custom") {
			return "Custom pricing";
		}

		const formattedPrice = format.number(price, {
			style: "currency",
			currency: currency,
			minimumFractionDigits: 0,
			maximumFractionDigits: 2,
			notation: "standard",
		});

		const period =
			normalizedFrequency === "monthly"
				? "/mo"
				: normalizedFrequency === "yearly"
				? "/yr"
				: normalizedFrequency === "daily"
				? "/day"
				: "";

		return `${formattedPrice}${period}`;
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
