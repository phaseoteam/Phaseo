"use client";

import { TokenInput as SharedTokenInput, type TokenInputProps } from "@phaseo/ui/token-input";
import { useTranslations } from "@/i18n/react";

/** The shared token input, with its screen-reader announcement from the message catalogues. */
function TokenInput(props: TokenInputProps) {
	const t = useTranslations("Common.ui.tokenInput");
	return <SharedTokenInput formatAnnouncement={(count) => t("suggestions", { count })} {...props} />;
}

export { TokenInput, type TokenInputProps };
export { tokenInputText, type Token, type TokenInputValue, type TokenSuggestion, type TokenTrigger } from "@phaseo/ui/token-input";
