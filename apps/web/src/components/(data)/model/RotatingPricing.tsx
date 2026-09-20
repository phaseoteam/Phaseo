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

export default function RotatingPricing({ prices = [] }: RotatingPricingProps) {
	const format = useDisplayFormatters();
	const [currentIndex, setCurrentIndex] = useState(0);
	const priceCount = prices.length;

	useEffect(() => {
		if (priceCount <= 1) return;

		const interval = setInterval(() => {
			setCurrentIndex((prev) => (prev + 1) % priceCount);
		}, 5000); // Rotate every 5 seconds

		return () => clearInterval(interval);
	}, [priceCount]);

	const formatPrice = (
		price: number,
		currency: string,
		frequency: string
	) => {
		const formattedPrice = format.number(price, {
			style: "currency",
			currency: currency,
			minimumFractionDigits: 0,
			maximumFractionDigits: 2,
			notation: "standard",
		});

		const period =
			frequency === "monthly"
				? "/mo"
				: frequency === "yearly"
				? "/yr"
				: frequency === "daily"
				? "/day"
				: "";

		return `${formattedPrice}${period}`;
	};

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
