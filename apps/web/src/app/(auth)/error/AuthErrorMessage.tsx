"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_AUTH_ERROR_MESSAGE, normalizeAuthErrorMessage, resolveHashAuthErrorMessage } from "@/lib/auth/errorMessage";

type AuthErrorMessageProps = {
    initialMessage?: string | null;
};

export default function AuthErrorMessage({ initialMessage }: AuthErrorMessageProps) {
    const fallbackMessage = useMemo(() => normalizeAuthErrorMessage(initialMessage), [initialMessage]);
    const [message, setMessage] = useState(fallbackMessage);

    useEffect(() => {
        const nextMessage = resolveHashAuthErrorMessage(window.location.hash);
        if (nextMessage) {
            setMessage(nextMessage);
            return;
        }
        setMessage(fallbackMessage || DEFAULT_AUTH_ERROR_MESSAGE);
    }, [fallbackMessage]);

    return <>{message}</>;
}
