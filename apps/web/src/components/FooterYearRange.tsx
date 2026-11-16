import { useEffect, useState } from "react";

type FooterYearRangeProps = {
	startYear: number;
};

// Render the current year on the server as well, so crawlers and reviewers
// never see a stale "© 2025" in the HTML. The effect only corrects the rare
// case where a cached page is hydrated after the year has changed.
export function FooterYearRange({ startYear }: FooterYearRangeProps) {
	const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());

	useEffect(() => {
		setCurrentYear(new Date().getFullYear());
	}, []);

	if (currentYear <= startYear) return <>{startYear}</>;
	return (
		<span suppressHydrationWarning>
			{startYear} - {currentYear}
		</span>
	);
}
