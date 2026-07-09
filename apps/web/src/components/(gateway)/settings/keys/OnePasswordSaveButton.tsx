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

	if (!encodedValue) return null;

	return React.createElement("onepassword-save-button", {
		"data-onepassword-type": "api-key",
		value: encodedValue,
		lang: "en",
		"data-theme": "light",
		padding: "compact",
	});
}
