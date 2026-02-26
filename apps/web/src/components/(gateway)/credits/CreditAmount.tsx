"use client";

import NumberFlow from "@number-flow/react";

interface CreditAmountProps {
	value: number;
	className?: string;
}

export function CreditAmount({ value, className = "" }: CreditAmountProps) {
	return (
		<span className={`font-mono ${className}`}>
			<NumberFlow
				value={value}
				locales="en-US"
				format={{
					style: "currency",
					currency: "USD",
					minimumFractionDigits: 2,
					maximumFractionDigits: 2,
				}}
				className="inline"
			/>
		</span>
	);
}
