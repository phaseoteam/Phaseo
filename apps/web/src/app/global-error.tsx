"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ErrorReporter } from "@/components/ErrorReporter";

const errorCopy = {
	"en-GB": {
		title: "Phaseo could not load this page",
		description: "Please try again. If the problem continues, contact Phaseo support.",
		retry: "Try again",
	},
	"en-US": {
		title: "Phaseo could not load this page",
		description: "Please try again. If the problem continues, contact Phaseo support.",
		retry: "Try again",
	},
	"es-ES": {
		title: "Phaseo no pudo cargar esta página",
		description: "Vuelve a intentarlo. Si el problema continúa, ponte en contacto con el soporte de Phaseo.",
		retry: "Intentar de nuevo",
	},
	"fr-FR": {
		title: "Phaseo n’a pas pu charger cette page",
		description: "Veuillez réessayer. Si le problème persiste, contactez l’assistance Phaseo.",
		retry: "Réessayer",
	},
	"de-DE": {
		title: "Phaseo konnte diese Seite nicht laden",
		description: "Bitte versuchen Sie es erneut. Wenn das Problem weiterhin besteht, wenden Sie sich an den Phaseo-Support.",
		retry: "Erneut versuchen",
	},
	"pt-BR": {
		title: "A Phaseo não conseguiu carregar esta página",
		description: "Tente novamente. Se o problema continuar, entre em contato com o suporte da Phaseo.",
		retry: "Tentar novamente",
	},
	hi: {
		title: "Phaseo यह पेज लोड नहीं कर सका",
		description: "कृपया फिर से कोशिश करें। समस्या बनी रहने पर Phaseo सहायता से संपर्क करें।",
		retry: "फिर से कोशिश करें",
	},
	ja: {
		title: "Phaseo はこのページを読み込めませんでした",
		description: "もう一度お試しください。問題が解決しない場合は、Phaseo サポートにお問い合わせください。",
		retry: "もう一度試す",
	},
	"zh-Hans": {
		title: "Phaseo 无法加载此页面",
		description: "请重试。如果问题仍然存在，请联系 Phaseo 支持。",
		retry: "重试",
	},
	"ar-SA": {
		title: "تعذّر على Phaseo تحميل هذه الصفحة",
		description: "يُرجى المحاولة مرة أخرى. إذا استمرت المشكلة، فتواصل مع دعم Phaseo.",
		retry: "إعادة المحاولة",
	},
} as const;

export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	const pathname = usePathname() ?? "/";
	const localeCandidate = pathname.split("/").filter(Boolean)[0];
	const locale = localeCandidate && localeCandidate in errorCopy
		? localeCandidate as keyof typeof errorCopy
		: "en-GB";
	const copy = errorCopy[locale];
	const direction = locale === "ar-SA" ? "rtl" : "ltr";

	useEffect(() => {
		// eslint-disable-next-line no-console
		console.error(error);
	}, [error]);

	return (
		<html lang={locale} dir={direction}>
			<body
				style={{
					alignItems: "center",
					background: "#fff",
					color: "#171717",
					display: "flex",
					fontFamily: "system-ui, sans-serif",
					justifyContent: "center",
					margin: 0,
					minHeight: "100vh",
					padding: "1.5rem",
				}}
		>
				<ErrorReporter error={error} source="global" />
				<main style={{ maxWidth: "28rem", textAlign: "center" }}>
					<h1 style={{ fontSize: "1.5rem", margin: 0 }}>
						{copy.title}
					</h1>
					<p style={{ lineHeight: 1.5, margin: "0.75rem 0 1.25rem" }}>
						{copy.description}
					</p>
					<button
						type="button"
						onClick={reset}
						style={{
							background: "#171717",
							border: 0,
							borderRadius: "0.5rem",
							color: "#fff",
							cursor: "pointer",
							font: "inherit",
							padding: "0.65rem 1rem",
						}}
					>
						{copy.retry}
					</button>
				</main>
			</body>
		</html>
	);
}
