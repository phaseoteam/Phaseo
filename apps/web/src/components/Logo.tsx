import type { ReactNode } from "react";
import Image, { type ImageProps } from "next/image";
import { resolveLogo, type LogoVariant, type LogoTheme } from "@/lib/logos";

type LogoImageProps = Omit<ImageProps, "src" | "alt"> & {
	id: string;
	alt?: string;
	variant?: LogoVariant;
	forceTheme?: LogoTheme;
	fallback?: ReactNode;
	fallbackToColor?: boolean;
};

export function Logo({
	id,
	alt,
	variant = "auto",
	forceTheme,
	fallback = null,
	fallbackToColor = true,
	className,
	...imageProps
}: LogoImageProps) {
	// If a theme is forced, render a single static variant
	if (forceTheme) {
		const resolved = resolveLogo(id, {
			variant,
			theme: forceTheme,
			fallbackToColor,
		});

		if (!resolved.src) return fallback;

		return (
			<Image
				src={resolved.src}
				alt={alt ?? resolved.label}
				className={className}
				{...imageProps}
			/>
		);
	}

	// Otherwise, pre-resolve both light and dark variants.
	// Theme switching is handled purely via CSS (.dark class).
	const light = resolveLogo(id, {
		variant,
		theme: "light",
		fallbackToColor,
	});
	const dark = resolveLogo(id, {
		variant,
		theme: "dark",
		fallbackToColor,
	});

	if (!light.src && !dark.src) return fallback;

	const label = alt ?? light.label ?? dark.label;

	// If both variants resolve to the same asset (e.g. colour-only logo),
	// just render a single image.
	if (light.src && dark.src && light.src === dark.src) {
		return (
			<Image
				src={light.src}
				alt={label}
				className={className}
				{...imageProps}
			/>
		);
	}

	return (
		<>
			{light.src && (
				<Image
					src={light.src}
					alt={label}
					className={[className, "block dark:hidden"]
						.filter(Boolean)
						.join(" ")}
					{...imageProps}
				/>
			)}
			{dark.src && (
				<Image
					src={dark.src}
					alt={label}
					className={[className, "hidden dark:block"]
						.filter(Boolean)
						.join(" ")}
					{...imageProps}
				/>
			)}
		</>
	);
}

export type { LogoVariant } from "@/lib/logos";
