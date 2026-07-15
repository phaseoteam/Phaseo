"use client";

import * as React from "react";

type OnePasswordSaveButtonProps = {
	title: string;
	secret: string;
	notes?: string;
	urls?: string[];
};

type SaveButtonModule = {
	activateOPButton?: () => void;
	encodeOPSaveRequest?: (request: {
		title: string;
		fields: Array<{ autocomplete: string; value: string }>;
		notes?: string;
		urls?: string[];
	}) => string | undefined;
};

export function OnePasswordSaveButton({
	title,
	secret,
	notes,
	urls,
}: OnePasswordSaveButtonProps) {
	const [encodedValue, setEncodedValue] = React.useState<string | null>(null);
	const [theme, setTheme] = React.useState<"light" | "dark">("light");
	const [isReady, setIsReady] = React.useState(false);
	const buttonRef = React.useRef<HTMLElement | null>(null);

	React.useEffect(() => {
		const root = document.documentElement;
		const syncTheme = () => {
			setTheme(root.classList.contains("dark") ? "dark" : "light");
		};

		syncTheme();
		const observer = new MutationObserver(syncTheme);
		observer.observe(root, { attributes: true, attributeFilter: ["class"] });
		return () => observer.disconnect();
	}, []);

	React.useEffect(() => {
		let cancelled = false;

		async function loadButton() {
			try {
				const saveButton = (await import(
					"@1password/save-button"
				)) as SaveButtonModule;
				const encoded = saveButton.encodeOPSaveRequest?.({
					title,
					fields: [
						{
							autocomplete: "current-password",
							value: secret,
						},
					],
					notes,
					urls,
				});
				if (!cancelled && encoded) {
					setEncodedValue(encoded);
					window.setTimeout(() => saveButton.activateOPButton?.(), 0);
				}
			} catch {
				// The browser extension is optional; other reveal actions still work.
			}
		}

		void loadButton();
		return () => {
			cancelled = true;
		};
	}, [title, secret, notes, urls]);

	React.useEffect(() => {
		if (!encodedValue) return;

		const interval = window.setInterval(() => {
			const nativeButton = buttonRef.current?.shadowRoot?.querySelector("button");
			if (nativeButton && !nativeButton.disabled) {
				setIsReady(true);
				window.clearInterval(interval);
			}
		}, 200);

		return () => window.clearInterval(interval);
	}, [encodedValue]);

	if (!encodedValue) return null;

	return React.createElement(
		"div",
		{
			className: isReady ? "block" : "hidden",
			"aria-hidden": !isReady,
		},
		React.createElement("onepassword-save-button", {
			ref: buttonRef,
			"data-onepassword-type": "api-key",
			value: encodedValue,
			lang: "en",
			class: "black",
			"data-theme": theme,
			padding: "compact",
		})
	);
}
