"use client";

import React from "react";

type Props = React.PropsWithChildren<{
	className?: string;
}>;

export default function PathCell({ children, className }: Props) {
	const onDoubleClick = (e: React.MouseEvent<HTMLSpanElement>) => {
		const el = e.currentTarget as HTMLElement;
		const range = document.createRange();
		range.selectNodeContents(el);
		const sel = window.getSelection();
		if (sel) {
			sel.removeAllRanges();
			sel.addRange(range);
		}
	};

	return (
		<td className={className}>
			{/* inner span limits the text-cursor to the actual path text only */}
			<span
				onDoubleClick={onDoubleClick}
				style={{ cursor: "text", display: "inline-block" }}
			>
				{children}
			</span>
		</td>
	);
}
