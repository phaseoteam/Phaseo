"use client";

import type { ComponentPropsWithoutRef, CSSProperties, FC } from "react";
import { cn } from "@/lib/utils";

export interface AnimatedShinyTextProps
	extends ComponentPropsWithoutRef<"span"> {
	shimmerWidth?: number;
}

export const AnimatedShinyText: FC<AnimatedShinyTextProps> = ({
	children,
	className,
	shimmerWidth = 140,
	...props
}) => {
	return (
		<span
			style={
				{
					"--shiny-width": `${shimmerWidth}px`,
				} as CSSProperties
			}
			className={cn(
				"group relative inline-grid w-fit place-items-center",
				className,
			)}
			{...props}
		>
			<span className="col-start-1 row-start-1">{children}</span>
			<span
				aria-hidden="true"
				className="pointer-events-none col-start-1 row-start-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
			>
				<span className="inline-flex w-fit items-center bg-[length:var(--shiny-width)_100%] bg-[position:130%_0] bg-no-repeat bg-clip-text text-transparent [background-image:linear-gradient(110deg,rgba(63,63,70,0.95)_40%,rgba(63,63,70,0.95)_46%,rgba(255,255,255,0.98)_50%,rgba(63,63,70,0.95)_54%,rgba(63,63,70,0.95)_60%)] group-hover:[animation:shiny-text_0.95s_cubic-bezier(.6,.6,0,1)_infinite] dark:[background-image:linear-gradient(110deg,rgba(212,212,216,0.92)_40%,rgba(212,212,216,0.92)_46%,rgba(255,255,255,1)_50%,rgba(212,212,216,0.92)_54%,rgba(212,212,216,0.92)_60%)]">
					{children}
				</span>
			</span>
		</span>
	);
};
