"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

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
	const t = useTranslations("SettingsUI");
	const locale = useLocale();
	const language = locale === "zh-Hans" ? "zh-CN" : locale.split("-")[0];
	const supportedLanguage = ["de", "en", "es", "fr", "it", "ja", "ko", "pt", "ru", "zh-CN", "zh-TW"].includes(language) ? language : undefined;
	const [encodedValue, setEncodedValue] = React.useState<string | null>(null);
	const [theme, setTheme] = React.useState<"light" | "dark">("light");
	const [isReady, setIsReady] = React.useState(false);
	const [loadError, setLoadError] = React.useState(false);
	const buttonRef = React.useRef<HTMLElement | null>(null);
	const statusId = React.useId();

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
					window.setTimeout(() => {
						if (!cancelled) saveButton.activateOPButton?.();
					}, 0);
				}
			} catch {
				if (!cancelled) setLoadError(true);
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
			const nativeButton = buttonRef.current?.shadowRoot?.querySelector<HTMLButtonElement>(
				"button[data-onepassword-save-button]",
			);
			if (nativeButton) {
				setIsReady(!nativeButton.disabled);
				if (!nativeButton.disabled) {
					window.clearInterval(interval);
				}
			}
		}, 200);

		return () => window.clearInterval(interval);
	}, [encodedValue]);

	if (!encodedValue) return null;

	function saveToOnePassword() {
		const nativeButton = buttonRef.current?.shadowRoot?.querySelector<HTMLButtonElement>(
			"button[data-onepassword-save-button]",
		);
		if (!nativeButton || nativeButton.disabled) {
			toast.error(
				t("newMainSettingsCopy.onePasswordUnavailableHelp"),
			);
			return;
		}
		nativeButton.click();
	}

	return (
		<div className="relative flex flex-wrap items-center gap-2">
			<Button
				type="button"
				variant="outline"
				size="sm"
				onClick={saveToOnePassword}
				aria-describedby={statusId}
			>
				<KeyRound className="h-4 w-4" />
				{t("newMainSettingsCopy.saveOnePassword")}
			</Button>
			{!isReady ? (
				<span
					id={statusId}
					className="text-xs text-muted-foreground"
					role="status"
				>
					{loadError
						? t("newMainSettingsCopy.onePasswordUnavailable")
						: t("newMainSettingsCopy.onePasswordRequirements")}
				</span>
			) : null}
			<div
				className="pointer-events-none absolute -left-[10000px] top-0 h-px w-px overflow-hidden"
				inert
				aria-hidden="true"
			>
				{React.createElement("onepassword-save-button", {
					ref: buttonRef,
					"data-onepassword-type": "api-key",
					value: encodedValue,
					lang: supportedLanguage,
					class: "black",
					"data-theme": theme,
					padding: "none",
				})}
			</div>
		</div>
	);
}
