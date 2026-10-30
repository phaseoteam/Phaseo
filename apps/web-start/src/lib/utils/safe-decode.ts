export function safeDecodeURIComponent(value?: string | null): string {
    if (value == null) {
        return "";
    }

    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}
