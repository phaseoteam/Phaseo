"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type LazyRenderOnVisibleProps = {
	children: ReactNode;
	minHeight?: number;
	rootMargin?: string;
};

export function LazyRenderOnVisible({
	children,
	minHeight = 720,
	rootMargin = "900px 0px",
}: LazyRenderOnVisibleProps) {
	const ref = useRef<HTMLDivElement>(null);
	const [shouldRender, setShouldRender] = useState(false);

	useEffect(() => {
		const node = ref.current;
		if (!node) return;
		if (!("IntersectionObserver" in window)) {
			setShouldRender(true);
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					setShouldRender(true);
					observer.disconnect();
				}
			},
			{ rootMargin },
		);

		observer.observe(node);
		return () => observer.disconnect();
	}, [rootMargin]);

	return (
		<div
			ref={ref}
			style={
				shouldRender
					? undefined
					: {
							minHeight,
							contentVisibility: "auto",
							containIntrinsicSize: `${minHeight}px`,
						}
			}
		>
			{shouldRender ? children : null}
		</div>
	);
}
