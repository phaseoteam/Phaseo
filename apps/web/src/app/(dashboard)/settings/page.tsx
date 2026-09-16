import { redirect } from "next/navigation";
import { fetchInternalAuthHeaderData } from "@/lib/fetchers/internal/fetchInternalAuthHeaderData";
import Link from "next/link";

export const metadata = {
	title: "Settings",
};

export default async function SettingsIndexPage() {
	const account = await fetchInternalAuthHeaderData().catch(() => null);
	if (!account) return <main className="container mx-auto max-w-xl px-4 py-16"><h1 className="text-xl font-semibold">Settings are temporarily unavailable</h1><p className="mt-2 text-sm text-muted-foreground">We could not verify your account mode. No settings were changed.</p><Link className="mt-5 inline-flex text-sm font-medium underline underline-offset-4" href="/settings">Try again</Link></main>;
	redirect(account.providerMode ? "/settings/account/providers" : "/settings/credits");
}
