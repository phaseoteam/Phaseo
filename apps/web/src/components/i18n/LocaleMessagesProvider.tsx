"use client";

// The root document supplies the complete locale and message tree. Using the
// client entry avoids next-intl's server wrapper reading request headers again
// while Next.js prerenders this shared shell.
export { NextIntlClientProvider as LocaleMessagesProvider } from "next-intl";
