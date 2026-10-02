import { NextResponse } from "next/server";
import { getPublicMessages } from "@/i18n/messages";
import { selectMessages } from "@/i18n/message-scopes";
import { isPublicLocale } from "@/i18n/routing";
import scopes from "@/i18n/lazy-message-scopes.json";

export async function GET(_request: Request, { params }: { params: Promise<{ locale: string; feature: string }> }) {
	const { locale, feature } = await params;
	if (!isPublicLocale(locale) || !Object.hasOwn(scopes, feature)) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}
	const messages = selectMessages(await getPublicMessages(locale), scopes[feature as keyof typeof scopes]);
	return NextResponse.json(messages, { headers: { "Cache-Control": "public, max-age=0, s-maxage=3600" } });
}
