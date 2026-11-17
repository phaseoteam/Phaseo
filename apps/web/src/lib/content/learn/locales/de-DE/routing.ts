import type { LearnCourse } from "../../types";

export const routingCourse: LearnCourse = {
	slug: "routing-and-presets",
	title: "Routing und Fallbacks steuern",
	summary:
		"Lege fest, welche Anbieter deine Anfragen bedienen, füge Fallback-Modelle hinzu und speichere gemeinsame Einstellungen in einer Voreinstellung.",
	level: "developer",
	format: "Jede Programmiersprache",
	prerequisites: ["Deine erste Anfrage senden"],
	lessons: [
		{
			slug: "route-across-providers",
			title: "Über Anbieter hinweg routen",
			summary: "Reihe, begrenze oder fixiere Anbieter und gib Fallback-Modelle für den Fall an, dass sie fehlschlagen.",
			minutes: 10,
			body: `Die meisten Modelle werden von mehreren Anbietern bedient. Für jede Anfrage behält Phaseo die Anbieter, die deine Regeln erlauben, reiht sie und ruft den besten auf. Schlägt dieser Anbieter fehl, versucht es den nächsten. Die Standardreihung \`balanced\` bewertet die Kosten pro erfolgreicher Antwort.

Das steuerst du mit dem Objekt \`provider\` (\`routing\` wird als Alias akzeptiert):

\`\`\`json
{
  "model": "openai/gpt-5.6-luna",
  "input": "Summarize this changelog.",
  "provider": {
    "order": ["openai", "azure"],
    "sort": "latency",
    "require_zero_data_retention": true
  }
}
\`\`\`

- \`order\` legt eine bevorzugte Reihenfolge fest; \`only\` und \`ignore\` erlauben oder blockieren Anbieter.
- \`sort\` reiht nach \`price\`, \`latency\` oder \`throughput\`. Die Modellsuffixe \`:cheap\`, \`:fast\` und \`:nitro\` tun dasselbe und haben Vorrang vor \`sort\`.
- \`max_price\` setzt Preisobergrenzen; \`required_execution_region\`, \`required_data_region\` und \`require_zero_data_retention\` schränken ein, wo und wie Daten verarbeitet werden.

Um einen Anbieter ohne Fallback auf andere Anbieter zu fixieren, setze ihn vor die Modell-ID: \`baseten:thinking-machines/inkling-small\`. Für regionales Routing der ganzen Anfrage sendest du Textanfragen stattdessen an \`eu.api.phaseo.app\` oder \`us.api.phaseo.app\`.

Um auf andere Modelle auszuweichen, gib sie in \`models\` an. Phaseo versucht zuerst \`model\`, dann jeden Eintrag der Reihe nach, aber erst, nachdem das vorherige Modell mit \`429\`, \`500\`, \`502\`, \`503\` oder \`504\` geendet hat. Fehler wie \`400\`, \`401\` oder \`402\` kommen sofort zurück. Jeder Versuch wird als eigene Anfrage abgerechnet, und das Feld \`model\` der Antwort nennt das Modell, das geantwortet hat. Ein Stream weicht nur vor seinem ersten Byte auf ein Fallback aus.`,
			quiz: {
				question: "Du sendest `\"model\": \"openai/gpt-6-astra\"` mit `\"models\": [\"anthropic/claude-sonnet-5.5\"]`. Das erste Modell gibt `400 validation_error` zurück. Was passiert?",
				options: [
					"Phaseo gibt den 400 sofort zurück und versucht das Fallback nicht",
					"Phaseo wiederholt die Anfrage mit `anthropic/claude-sonnet-5.5`",
					"Phaseo wiederholt dasselbe Modell bei einem anderen Anbieter, dann das Fallback",
				],
				answer: 0,
				explanation:
					"Fallback-Modelle werden nur nach 429, 500, 502, 503 oder 504 versucht. Ein 400 ist ein Problem der Anfrage selbst, deshalb kommt er sofort zurück; ein anderes Modell würde sie ebenfalls ablehnen.",
			},
			scenario: {
				prompt:
					"Deine Rechtsabteilung verlangt, dass Kunden-Prompts nur an Anbieter mit Zero Data Retention gehen und die App einen bestimmten Anbieter nie nutzt. Du willst nicht auf einen einzigen Anbieter fixieren. Was sendest du?",
				answer:
					"Behalte die einfache Modell-ID, damit Phaseo weiter zwischen Anbietern ausweichen kann, und ergänze `\"provider\": { \"require_zero_data_retention\": true, \"ignore\": [\"<provider-id>\"] }`. Eine Fixierung mit `provider:model` würde das Fallback zwischen Anbietern abschalten, und das willst du nicht.",
			},
			takeaway:
				"Nutze `provider`, um Anbieter zu reihen und einzuschränken, ein Präfix `provider:`, um einen zu fixieren, und `models`, um bei wiederholbaren Fehlern auf andere Modelle auszuweichen.",
			links: [
				{ label: "Routing und Fallbacks", href: "https://phaseo.app/docs/v1/guides/routing-and-fallbacks" },
				{ label: "Anbieterparameter", href: "https://phaseo.app/docs/v1/api-reference/parameters" },
				{ label: "Anbieterqualifizierte Modell-IDs", href: "https://phaseo.app/docs/v1/guides/provider-qualified-models" },
				{ label: "Regionales Routing", href: "https://phaseo.app/docs/v1/guides/regional-routing" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "use-a-preset",
			title: "Eine Voreinstellung nutzen",
			summary: "Speichere Modell, Prompt und Routing-Regeln unter einem Namen und rufe sie aus jeder App auf.",
			minutes: 7,
			body: `Eine Voreinstellung speichert Modell, Systemprompt, Parameter und Anbieterregeln für eine Aufgabe unter einem Namen wie \`@support-triage\`. Aufrufer senden diesen Namen als \`model\` und nur noch die Eingabe. Phaseo ergänzt den Rest, bevor es einen Anbieter wählt. Erstelle Voreinstellungen unter **Einstellungen → Voreinstellungen** oder mit \`POST /v1/presets\` und einem Management-Schlüssel.

\`\`\`bash
curl https://api.phaseo.app/v1/responses \\
  -H "Authorization: Bearer $PHASEO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "@support-triage",
    "input": "Customer says the invoice total is wrong."
  }'
\`\`\`

Ein eigenes Feld \`preset\` gibt es nicht. Nenne eine Version mit \`@support-triage@v3\` oder folge einem Label mit \`@support-triage@production\`, damit du durch Verschieben des Labels zurückrollen kannst.

Wenn Anfrage und Voreinstellung beide etwas festlegen, entscheiden diese Regeln:

- **Parameter füllen Lücken.** Die Standardwerte einer Voreinstellung gelten nur für Felder, die die Anfrage weglässt. Ein Wert in der Anfrage gewinnt immer.
- **Systemprompts werden gestapelt.** Der Prompt der Voreinstellung kommt zuerst, dann der eigene Prompt der Anfrage.
- **Anbietereinstellungen in der Anfrage gewinnen.** \`provider.order\` oder \`provider.max_price\` in der Anfrage ersetzt den Wert der Voreinstellung für dieses Feld.
- **Zulassungslisten schränken ein, erweitern aber nie.** Ein Modell außerhalb der erlaubten Modelle der Voreinstellung schlägt mit \`validation_error\` fehl; es wird nicht umgeleitet.`,
			quiz: {
				question: "Deine Voreinstellung setzt `temperature` auf 0.2. Eine Anfrage sendet `\"model\": \"@support-triage\"` mit `\"temperature\": 0.8`. Welcher Wert wird genutzt?",
				options: [
					"0.2, weil die Voreinstellung ihre Parameter festschreibt",
					"0.8, weil ein Wert in der Anfrage immer gewinnt",
					"0.5, weil Phaseo den Mittelwert der beiden Werte bildet",
				],
				answer: 1,
				explanation:
					"Die Standardparameter einer Voreinstellung füllen nur die Felder, die eine Anfrage weglässt. Wenn die Anfrage einen Wert setzt, gewinnt die Anfrage.",
			},
			scenario: {
				prompt:
					"Drei Dienste rufen dasselbe Support-Modell mit kopierten Prompts und Anbieterregeln auf. Eine Prompt-Änderung kam nur bei einem Dienst an, und die Antworten unterscheiden sich jetzt. Wie verhinderst du, dass das wieder passiert?",
				answer:
					"Verschiebe das gemeinsame Modell, den Systemprompt und die Anbieterregeln in eine Voreinstellung und lass jeden Dienst `\"model\": \"@support-triage@production\"` senden. Veröffentliche Änderungen als neue Versionen und verschiebe das Label `production`, um sie auszurollen, oder zurück, um zurückzurollen.",
			},
			takeaway:
				"Leg gemeinsame Einstellungen in eine Voreinstellung, ruf sie in `model` über ihren Namen auf und lass Werte in der Anfrage die Standardwerte der Voreinstellung überschreiben, wo du es brauchst.",
			links: [
				{ label: "Voreinstellungen", href: "https://phaseo.app/docs/v1/guides/presets" },
				{ label: "Prompt-Vorlagen", href: "https://phaseo.app/docs/v1/guides/prompt-templates" },
				{ label: "Routing und Fallbacks", href: "https://phaseo.app/docs/v1/guides/routing-and-fallbacks" },
			],
			updated: "2026-11-17",
		},
	],
};
