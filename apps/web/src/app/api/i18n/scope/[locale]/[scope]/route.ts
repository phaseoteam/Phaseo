import { NextResponse } from "next/server";
import { allClientMessageScopes, clientMessagesScopeId, selectScopeMessages } from "@/i18n/client-message-files";
import { getPublicMessages } from "@/i18n/messages";
import { isPublicLocale } from "@/i18n/routing";

/**
 * Pages load their dictionaries from the content-addressed files in /_i18n.
 * A tab opened before a deployment that changed the copy asks for a file that
 * no longer exists, so it falls back to the current copy of the same scope here.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ locale: string; scope: string }> }) {
	const { locale, scope } = await params;
	const match = allClientMessageScopes().find((candidate) => clientMessagesScopeId(candidate) === scope);
	if (!isPublicLocale(locale) || !match) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}
	const messages = selectScopeMessages(await getPublicMessages(locale) as Record<string, unknown>, match);
	return NextResponse.json(messages, { headers: { "Cache-Control": "public, max-age=0, s-maxage=86400" } });
}
