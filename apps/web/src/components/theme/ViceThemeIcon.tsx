import { useId } from "react";

/**
 * "VI" in a pastel sunset: the icon for the Vice launch theme in the theme
 * pickers. Original lettering, drawn as plain geometry so it stays crisp at
 * 14–16 px. The sunset stops follow the launch site's palette.
 */
export function ViceThemeIcon({ className }: { className?: string }) {
	const gradientId = `vice-icon-sunset-${useId().replace(/:/g, "")}`;
	return (
		<svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
			<defs>
				{/* The theme's sunset, left to right, like its buttons and titles. */}
				<linearGradient id={gradientId} x1="1.5" y1="12" x2="21.1" y2="12" gradientUnits="userSpaceOnUse">
					<stop offset="0" stopColor="#ffa860" />
					<stop offset="0.35" stopColor="#ff7f70" />
					<stop offset="0.7" stopColor="#f2609f" />
					<stop offset="1" stopColor="#a072e8" />
				</linearGradient>
			</defs>
			<path
				fill={`url(#${gradientId})`}
				d="M1.5 4h3.6l3.4 10.6L11.9 4h3.6L10.4 20H6.6L1.5 4Zm16 0h3.6v16h-3.6V4Z"
			/>
		</svg>
	);
}
