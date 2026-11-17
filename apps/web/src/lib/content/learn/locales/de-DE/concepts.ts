import type { LearnCourse } from "../../types";

export const conceptsCourse: LearnCourse = {
	slug: "how-language-models-work",
	title: "Wie Sprachmodelle funktionieren",
	summary:
		"Eine leicht verständliche Einführung in Sprachmodelle: wie sie lernen, wie Tokens und Kontext funktionieren und wie du prüfst, was sie dir sagen.",
	level: "beginner",
	format: "Ohne Code",
	prerequisites: [],
	lessons: [
		{
			slug: "how-models-learn",
			title: "Wie Modelle lernen",
			summary:
				"Ein Sprachmodell lernt Muster aus riesigen Textmengen und wird dann darauf abgestimmt, Anweisungen zu folgen.",
			minutes: 6,
			body: `Ein Sprachmodell ist ein Programm, das Text liest und den Text schreibt, der am wahrscheinlichsten als Nächstes kommt. Es tut das Stück für Stück. Stell ihm eine Frage, und es schreibt eine Antwort, die zu den gelernten Mustern passt.

**Modelle lernen in zwei Hauptschritten.** Zuerst kommt das **Pre-Training**: Das Modell liest sehr viel Text, etwa Bücher, Websites und Code, und lernt, das nächste Wort vorherzusagen. Dabei eignet es sich Sprache, Fakten und Denkmuster an. Danach kommt das **Tuning**: Menschen trainieren es mit Beispielen guter Antworten weiter, damit es Anweisungen folgt und sich wie ein hilfreicher Assistent verhält, statt nur deinen Text fortzusetzen.

**Modelle haben einen Wissensstichtag.** Das Training endet an einem bestimmten Datum, und das Modell weiß nichts über das, was danach passiert ist. Es schlägt nicht von sich aus nach. Wenn du aktuelle Fakten brauchst, musst du sie dem Modell geben, zum Beispiel indem du ein Dokument in deinen Prompt aufnimmst oder ein Websuche-Tool einschaltest.

**Reasoning-Modelle denken nach, bevor sie antworten.** Sie verbrauchen zusätzliche Tokens, um das Problem erst durchzuarbeiten, und schreiben dann die Antwort. Das hilft bei schwierigen Aufgaben wie Mathematik, Code oder Planung, dauert aber länger und kostet mehr, weil diese Denk-Tokens als Ausgabe zählen. Bei Phaseo legst du mit \`reasoning.effort\` (oder \`reasoning_effort\` bei Chat Completions) fest, wie viel ein Modell nachdenkt, von \`none\` bis \`max\`. Mehr Aufwand hilft bei schwierigen Aufgaben und kostet mehr Zeit und Tokens.

**Open-Weight- und geschlossene Modelle.** Manche Labore veröffentlichen die Gewichte eines Modells, also die Zahlen, die es im Training gelernt hat, sodass viele Anbieter es hosten können. Andere halten die Gewichte privat und bieten das Modell nur über ihre eigene API oder ausgewählte Partner an. Bei Phaseo rufst du beide Arten gleich auf. Die Seite eines Modells zeigt seine Lizenz unter **Über dieses Modell** und listet jeden Anbieter, der es hostet.`,
			quiz: {
				question:
					"Du fragst ein Modell nach etwas, das letzte Woche passiert ist, und es gibt eine veraltete oder erfundene Antwort. Warum?",
				options: [
					"Das Modell ist defekt und braucht einen anderen Anbieter.",
					"Dein Reasoning-Aufwand war zu niedrig eingestellt.",
					"Das Modell kennt nur, was in seinen Trainingsdaten stand, bis zu seinem Wissensstichtag.",
				],
				answer: 2,
				explanation:
					"Ein Modell lernt aus Text, der bis zu einem bestimmten Datum gesammelt wurde. Spätere Ereignisse kann es nicht kennen, außer du gibst ihm diese Informationen, zum Beispiel in deinem Prompt oder mit einem Websuche-Tool.",
			},
			scenario: {
				prompt:
					"Du nutzt ein Reasoning-Modell, um einfache Kundenfragen wie Öffnungszeiten zu beantworten. Die Antworten stimmen, sind aber langsam und teurer als erwartet. Was könntest du ändern?",
				answer:
					"Einfache Fragen brauchen selten viel Nachdenken. Senke `reasoning.effort` (oder `reasoning_effort`) oder nutze ein Modell ohne Reasoning. Die Denk-Tokens zählen als Ausgabe, weniger Nachdenken heißt also schnellere und günstigere Antworten. Hebe dir hohen Aufwand für schwierige Aufgaben auf.",
			},
			takeaway:
				"Ein Modell sagt Text aus dem voraus, was es im Training gelernt hat, weiß nichts nach seinem Stichtag, und Reasoning-Modelle tauschen Zeit und Tokens gegen bessere Antworten bei schwierigen Aufgaben.",
			links: [
				{
					label: "Reasoning-Parameter",
					href: "https://phaseo.app/docs/v1/api-reference/parameters#parameter-reasoning",
				},
				{
					label: "Modelle erkunden",
					href: "https://phaseo.app/docs/v1/exploring/models",
				},
				{ label: "Modelle", href: "https://phaseo.app/models" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "tokens-and-context",
			title: "Tokens und Kontext",
			summary:
				"Modelle lesen und schreiben Tokens, und jedes Token, das du sendest oder bekommst, kostet Zeit und Geld.",
			minutes: 7,
			body: `Modelle lesen Wörter nicht so wie du. Sie zerlegen Text in **Tokens**: kurze Wortteile, ganze kurze Wörter, Leerzeichen und Satzzeichen. Ein langes Wort kann aus mehreren Tokens bestehen. Alles wird in Tokens gezählt, von den Grenzen dessen, was ein Modell lesen kann, bis zum Preis, den du zahlst.

**Das Kontextfenster ist das, was ein Modell auf einmal lesen kann.** Es enthält alles in einer Anfrage: deine Anweisungen, die bisherige Unterhaltung, Dokumente oder Suchergebnisse, Tool-Definitionen und die Antwort, die das Modell schreibt. Jede Anbieterroute hat ihre eigene **Kontextlänge**, die auf der Modellseite angezeigt wird.

**Eingabe- und Ausgabetokens werden getrennt gezählt:**

| Art | Was dazugehört |
| --- | --- |
| Eingabe | Anweisungen, deine Nachrichten, Dokumente, Tool-Definitionen |
| Ausgabe | Die Antwort, plus das Nachdenken eines Reasoning-Modells |

Ausgabe kostet pro Token meist mehr als Eingabe, weil das Modell jedes Ausgabetoken einzeln schreiben muss. Bei Phaseo werden Textpreise in USD pro 1 Million Tokens angezeigt, mit getrennten Preisen für Eingabe und Ausgabe. Das Feld \`usage\` jeder Antwort meldet, wie viele Tokens sie verbraucht hat.

**Ausgabelimits beenden Antworten früh.** Du kannst die Ausgabe mit \`max_tokens\` (Chat Completions und Messages) oder \`max_output_tokens\` (Responses) begrenzen. Das hält Kosten und Wartezeit niedrig. Ist das Limit aber zu klein, wird die Antwort abgeschnitten, und die Antwort endet mit \`finish_reason: "length"\`. Das ist kein Fehler des Modells: Erhöhe das Limit oder senke den Reasoning-Aufwand.

**Prompt-Caching macht wiederholte Eingaben günstiger.** Wenn der Anfang deines Prompts über Anfragen hinweg gleich bleibt, etwa lange Anweisungen oder ein Referenzdokument, kann der Anbieter ihn aus seinem Cache lesen. Diese Tokens werden zum niedrigeren Cache-Lesepreis abgerechnet, und das erste Token kommt schneller. Die meisten Anbieter cachen wiederholte Anfänge von selbst; Claude cacht nur, was du mit \`cache_control\` markierst.`,
			quiz: {
				question:
					"Eine Antwort bricht mitten im Satz ab, und `finish_reason` ist `\"length\"`. Was ist passiert?",
				options: [
					"Der Anbieter ist ausgefallen, also hätte Phaseo einen anderen versuchen sollen.",
					"Die Antwort hat das Ausgabelimit erreicht und wurde deshalb abgeschnitten.",
					"Der Prompt war zu lang für das Kontextfenster des Modells.",
				],
				answer: 1,
				explanation:
					"`finish_reason: \"length\"` bedeutet, dass die Antwort das Ausgabelimit erreicht hat (`max_tokens` oder `max_output_tokens`). Erhöhe das Limit oder senke den Reasoning-Aufwand, falls ein Reasoning-Modell es mit Nachdenken aufgebraucht hat.",
			},
			scenario: {
				prompt:
					"Dein Support-Bot sendet am Anfang jeder Anfrage dasselbe 20-seitige Richtliniendokument, gefolgt von der Frage der Kundin oder des Kunden. Deine Rechnung besteht größtenteils aus Eingabetokens. Was kannst du tun?",
				answer:
					"Lass die Richtlinie unverändert am Anfang des Prompts, damit der Anbieter sie cachen kann. Wiederholte Eingaben werden dann zum Cache-Lesepreis abgerechnet, und Antworten beginnen schneller. Bei Claude markierst du das Ende der Richtlinie mit `cache_control`. Du kannst das Dokument auch auf die Teile kürzen, auf die es ankommt.",
			},
			takeaway:
				"Alles wird in Tokens gezählt: Eingabe und Ausgabe haben getrennte Preise pro Million, Ausgabelimits können Antworten abschneiden, und Caching macht wiederholte Eingaben günstiger.",
			links: [
				{
					label: "Kontext- und Tokenbudget",
					href: "https://phaseo.app/docs/v1/guides/context-and-token-budgeting",
				},
				{
					label: "Prompt-Caching",
					href: "https://phaseo.app/docs/v1/guides/prompt-caching",
				},
				{
					label: "Preise und Abrechnung",
					href: "https://phaseo.app/docs/v1/pricing/tiers",
				},
				{
					label: "Glossar",
					href: "https://phaseo.app/docs/v1/glossary",
				},
			],
			updated: "2026-11-17",
		},
		{
			slug: "check-the-output",
			title: "Die Ausgabe prüfen",
			summary:
				"Modelle können sicher klingen und trotzdem falsch liegen. Stütze ihre Antworten deshalb auf Quellen und teste, bevor du dich auf sie verlässt.",
			minutes: 7,
			body: `Ein Modell schreibt den Text, der am wahrscheinlichsten als Nächstes kommt. Meistens ist das auch richtig. Wenn es etwas aber nicht weiß, kann es trotzdem eine flüssige, selbstsichere Antwort schreiben, die falsch ist. Das nennt man **Halluzination**. Erfundene Fakten, Zitate, Links und Zahlen sind typische Beispiele.

**Stütze Antworten auf echte Daten und prüfe die Quellen.** Ein Modell ist viel zuverlässiger, wenn die Fakten vor ihm liegen. Gib deine eigenen Dokumente in den Prompt, bitte es, nur daraus zu antworten und zu sagen, woher jeder Fakt stammt. Für aktuelle Informationen fügst du das Server-Tool \`phaseo:web_search\` hinzu (in der Beta): Das Modell durchsucht das Web und schreibt eine Antwort aus den Ergebnissen, die URLs enthalten, die du öffnen kannst. Öffne sie auch, denn ein Modell kann auch einen Link erfinden, der echt aussieht.

**Hol dir mit strukturierten Ausgaben eine verlässliche Form.** Wenn dein Code die Antwort lesen muss, sende ein JSON Schema mit der Anfrage. Das Modell gibt dann JSON in dieser Form statt freiem Text zurück. Dein Code sollte das Ergebnis trotzdem prüfen, bevor er es nutzt, denn die Form kann stimmen, während der Inhalt falsch ist.

**Senke die Temperatur für mehr Beständigkeit.** \`temperature\` steuert, wie viel Variation das Modell einbringt. Niedrigere Werte geben stabilere, besser wiederholbare Antworten. Für Extraktion, Klassifizierung und JSON empfiehlt die Dokumentation \`0.0\` bis \`0.2\`.

**Teste mit echten Beispielen, bevor du veröffentlichst.** Sammle echte Eingaben, auch unordentliche und ungewöhnliche, und prüfe die Antworten von Hand. Wiederhole das, wann immer du den Prompt oder das Modell änderst.`,
			quiz: {
				question:
					"Deine App fragt ein Modell nach dem Gründungsjahr eines Unternehmens, und die Antwort muss stimmen. Was ist der beste Ansatz?",
				options: [
					"Die Antwort auf eine vertrauenswürdige Quelle stützen, etwa Websuchergebnisse oder deine eigenen Daten, und die Quelle prüfen.",
					"`temperature` auf `0` setzen, damit das Modell immer richtig liegt.",
					"Das Modell fragen, wie sicher es ist, und ihm vertrauen, wenn es sagt, es sei sicher.",
				],
				answer: 0,
				explanation:
					"Eine niedrige Temperatur macht Antworten beständiger, nicht richtiger, und ein Modell kann sicher klingen und trotzdem falsch liegen. Erst eine vertrauenswürdige Quelle, die du auch prüfst, macht die Antwort zuverlässig.",
			},
			scenario: {
				prompt:
					"Du hast ein Tool gebaut, das Summe, Datum und Lieferanten aus Rechnungen ausliest. In der Demo hat es funktioniert, aber in der Produktion stürzt dein Code manchmal ab, weil das Modell mit einem Satz statt mit den Feldern antwortet. Was änderst du?",
				answer:
					"Nutze strukturierte Ausgaben: Sende ein JSON Schema mit den Feldern, die du brauchst, damit das Modell JSON in dieser Form zurückgibt. Setze eine niedrige `temperature`, etwa `0.0` bis `0.2`. Validiere das JSON in deinem Code, bevor du es nutzt, und teste vor der Veröffentlichung mit einer Reihe echter Rechnungen, auch unordentlicher.",
			},
			takeaway:
				"Behandle Modellantworten als Entwürfe: Stütze sie auf echte Quellen, verlange eine feste Form, halte die Temperatur für Beständigkeit niedrig und teste mit echten Beispielen.",
			links: [
				{
					label: "Server-Tool für die Websuche",
					href: "https://phaseo.app/docs/v1/guides/server-tools/web-search",
				},
				{
					label: "Strukturierte Ausgaben",
					href: "https://phaseo.app/docs/v1/guides/structured-outputs",
				},
				{
					label: "Inferenzparameter",
					href: "https://phaseo.app/docs/v1/guides/inference-parameters",
				},
			],
			updated: "2026-11-17",
		},
	],
};
