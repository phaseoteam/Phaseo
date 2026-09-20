"use client";

import { useInView, useMotionValue, useSpring } from "motion/react";
import { ComponentPropsWithoutRef, useEffect, useRef } from "react";

import { useDisplayFormatters } from "@/components/providers/DisplayPreferencesProvider";
import { cn } from "@/lib/utils";

interface NumberTickerProps extends ComponentPropsWithoutRef<"span"> {
	value: number;
	startValue?: number;
	direction?: "up" | "down";
	delay?: number;
	decimalPlaces?: number;
}

export function NumberTicker({
	value,
	startValue = 0,
	direction = "up",
	delay = 0,
	className,
	decimalPlaces = 0,
	...props
}: NumberTickerProps) {
	const format = useDisplayFormatters();
	const ref = useRef<HTMLSpanElement>(null);
	const motionValue = useMotionValue(
		direction === "down" ? value : startValue
	);
	const springValue = useSpring(motionValue, {
		damping: 60,
		stiffness: 100,
	});
	const isInView = useInView(ref, { once: true, margin: "0px" });

	useEffect(() => {
		if (isInView) {
			const timer = setTimeout(() => {
				motionValue.set(direction === "down" ? startValue : value);
			}, delay * 1000);
			return () => clearTimeout(timer);
		}
	}, [motionValue, isInView, delay, value, direction, startValue]);

	useEffect(
		() =>
			springValue.on("change", (latest) => {
				if (ref.current) {
					const factor = 10 ** decimalPlaces;
					ref.current.textContent = format.number(Math.round(latest * factor) / factor, {
						minimumFractionDigits: decimalPlaces,
						maximumFractionDigits: decimalPlaces,
					});
				}
			}),
		[springValue, decimalPlaces, format]
	);

	return (
		<span
			ref={ref}
			className={cn(
				"inline-block tabular-nums tracking-wider text-black dark:text-white",
				className
			)}
			{...props}
		>
			{format.number(startValue, {
				minimumFractionDigits: decimalPlaces,
				maximumFractionDigits: decimalPlaces,
			})}
		</span>
	);
}
