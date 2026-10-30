"use client";

import { useEffect, useState } from "react";

type FooterYearRangeProps = {
	startYear: number;
};

export function FooterYearRange({ startYear }: FooterYearRangeProps) {
	const [currentYear, setCurrentYear] = useState(startYear);

	useEffect(() => {
		setCurrentYear(new Date().getFullYear());
	}, []);

	if (currentYear <= startYear) return <>{startYear}</>;
	return (
		<>
			{startYear} - {currentYear}
		</>
	);
}

