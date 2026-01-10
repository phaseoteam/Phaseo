"use client";

import { useEffect, useRef } from "react";
import NumberFlow from "@number-flow/react";

interface CreditAmountProps {
	value: number;
	className?: string;
}

function extractParts(value: number): {
	integerRaw: number;
	mainDecimals: number;
	subscript: number | null;
} {
	const [integerRaw, decimalPart = ""] = value.toFixed(5).split(".");

	if (decimalPart.length <= 2) {
		return {
			integerRaw: Number(integerRaw),
			mainDecimals: Number(decimalPart.padEnd(2, "0")),
			subscript: null,
		};
	}

	const mainDecimals = Number(decimalPart.slice(0, 2));
	const subscript = Number(decimalPart.slice(2));

	return { integerRaw: Number(integerRaw), mainDecimals, subscript };
}

export function CreditAmount({ value, className = "" }: CreditAmountProps) {
	const { integerRaw, mainDecimals, subscript } = extractParts(value);

	return (
		<span className={`font-mono ${className}`}>
			<span>$</span>
			<NumberFlow
				value={integerRaw}
				locales="en-US"
				format={{ style: "decimal", maximumFractionDigits: 0 }}
				className="inline"
			/>
			<span>.</span>
			<NumberFlow
				value={mainDecimals}
				locales="en-US"
				format={{
					style: "decimal",
					minimumIntegerDigits: 1,
					minimumFractionDigits: 2,
					maximumFractionDigits: 2,
				}}
				className="inline"
			/>
			{subscript !== null && (
				<sub className="text-xs">
					<NumberFlow
						value={subscript}
						locales="en-US"
						format={{
							style: "decimal",
							minimumIntegerDigits: 3,
							maximumFractionDigits: 0,
						}}
						className="inline"
					/>
				</sub>
			)}
		</span>
	);
}
