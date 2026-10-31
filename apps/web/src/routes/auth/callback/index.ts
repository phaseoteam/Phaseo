import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/utils/supabase/server";
import { waitUntil } from "@/compat/wait-until";
import { serializeCookie, type CookieOptions } from "@/lib/http/cookies";
import { getTranslations } from "@/i18n/server";
import {
	buildAuthErrorCodeRedirectUrl,
	resolveCallbackErrorCode,
} from "@/lib/auth/errorMessage";
import { sanitizeReturnUrl } from "@/lib/auth/return-url";
import { finalizePostLogin } from "@/lib/auth/post-login";
import {
	resolveAuthLocaleFromUrl,
	withAuthLocale,
} from "@/lib/auth/localized-paths";
import { getLocaleDefinition, type PublicLocale } from "@/i18n/routing";

async function buildHashPreservingAuthErrorResponse(
	requestUrl: string,
	locale: PublicLocale,
) {
	const t = await getTranslations({ locale, namespace: "Common.authFlows.callback" });
	const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character] ?? character);
	const direction = getLocaleDefinition(locale).dir;
	const fallbackUrl = buildAuthErrorCodeRedirectUrl(
		requestUrl,
		"default",
		locale,
	);
	const fallbackPath = `${fallbackUrl.pathname}${fallbackUrl.search}`;
	const errorPath = fallbackUrl.pathname;

	const html = `<!doctype html>
<html lang="${locale}" dir="${direction}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(t("redirecting"))}</title>
    <noscript>
      <meta http-equiv="refresh" content="0;url=${fallbackPath}" />
    </noscript>
  </head>
  <body>
    <script>
      (function () {
        try {
          var rawHash = window.location.hash || '';
          var normalizedHash = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash;
          var params = new URLSearchParams(normalizedHash);
          var hasAuthError =
            !!params.get('error') ||
            !!params.get('error_code') ||
            !!params.get('error_description');

          var target = hasAuthError && normalizedHash
            ? ${JSON.stringify(errorPath)} + '#' + normalizedHash
            : ${JSON.stringify(fallbackPath)};
          window.location.replace(target);
        } catch (_e) {
          window.location.replace(${JSON.stringify(fallbackPath)});
        }
      })();
    </script>
    <noscript>
      <p>${escapeHtml(t("redirectingToError"))}</p>
      <p><a href="${fallbackPath}">${escapeHtml(t("continue"))}</a></p>
    </noscript>
  </body>
</html>`;

	return new Response(html, {
		headers: {
			"Content-Type": "text/html; charset=utf-8",
			"Cache-Control": "no-store",
		},
	});
}

// A 307 with mutable headers, so session cookies can be added to it.
function redirectResponse(target: string | URL): Response {
	return new Response(null, { status: 307, headers: { location: String(target) } });
}

async function handleGet(request: Request) {
	const url = new URL(request.url);
	const code = url.searchParams.get("code");
	const type = url.searchParams.get("type");
	const locale = resolveAuthLocaleFromUrl(url);
	const returnUrl = sanitizeReturnUrl(url.searchParams.get("returnUrl"), "/");
	const callbackErrorCode = resolveCallbackErrorCode(url);

	if (callbackErrorCode) {
		console.error("Auth callback provider error", {
			error: url.searchParams.get("error"),
			errorCode: url.searchParams.get("error_code"),
			errorDescription: url.searchParams.get("error_description"),
		});
		return redirectResponse(
			buildAuthErrorCodeRedirectUrl(request.url, callbackErrorCode, locale),
		);
	}

	const pendingCookies: Array<{
		name: string;
		value: string;
		options?: CookieOptions;
	}> = [];
	const supabaseUser = await createClient({
		onSetCookies: (cookies) => pendingCookies.push(...cookies),
	});
	const redirectWithSession = (target: string | URL) => {
		const response = redirectResponse(new URL(target, url));
		for (const cookie of pendingCookies) {
			response.headers.append("set-cookie", serializeCookie(cookie.name, cookie.value, cookie.options));
		}
		return response;
	};

	if (type !== "email") {
		if (!code) {
			console.error("Auth callback missing code", {
				search: url.search,
			});
			return buildHashPreservingAuthErrorResponse(request.url, locale);
		}

		const { error: exchangeErr } =
			await supabaseUser.auth.exchangeCodeForSession(code);
		if (exchangeErr) {
			console.error("Auth code exchange failed", {
				message: exchangeErr.message,
				status: (exchangeErr as { status?: number }).status,
				code: (exchangeErr as { code?: string }).code,
			});
			return redirectWithSession(
				buildAuthErrorCodeRedirectUrl(request.url, "default", locale),
			);
		}
	}

	const {
		data: { user },
	} = await supabaseUser.auth.getUser();
	if (!user?.id) {
		console.error("Auth callback missing authenticated user after session exchange");
		if (type === "email") {
			return buildHashPreservingAuthErrorResponse(request.url, locale);
		}
		return redirectWithSession(
			buildAuthErrorCodeRedirectUrl(request.url, "default", locale),
		);
	}

	const {
		data: { session },
	} = await supabaseUser.auth.getSession();

	try {
		const result = await finalizePostLogin({
			supabaseUser,
			user,
			session,
			returnUrl,
			source: "auth_callback",
			deferTask: (task) => void waitUntil(Promise.resolve().then(task)),
		});
		const redirectPath = result.redirectPath.startsWith("/auth/verify-mfa")
			? withAuthLocale(result.redirectPath, locale)
			: result.redirectPath;
		return redirectWithSession(redirectPath);
	} catch (error) {
		console.error("Failed to finalize post-login state during auth callback", {
			userId: user.id,
			error: error instanceof Error ? error.message : String(error),
		});
		return redirectWithSession(
			buildAuthErrorCodeRedirectUrl(request.url, "workspace-setup", locale),
		);
	}
}

export const Route = createFileRoute("/auth/callback/")({
	server: {
		handlers: {
			GET: ({ request }) => handleGet(request),
		},
	},
});
