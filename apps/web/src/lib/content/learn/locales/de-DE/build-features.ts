import type { LearnCourse } from "../../types";

export const buildFeaturesCourse: LearnCourse = {
	slug: "build-real-features",
	title: "Echte Funktionen bauen",
	summary:
		"Lass Modelle deine Funktionen aufrufen, JSON in einer festen Form zurückgeben und Bilder, Dateien und Audio als Eingabe annehmen.",
	level: "developer",
	format: "Jede Programmiersprache",
	prerequisites: ["Deine erste Anfrage senden"],
	lessons: [
		{
			slug: "call-tools",
			title: "Tools aufrufen",
			summary: "Beschreibe deine Funktionen, führe die Aufrufe aus, die das Modell anfordert, und sende die Ergebnisse zurück, bis es antwortet.",
			minutes: 10,
			body: `Beschreibe deine Funktionen in \`tools\`, dann antwortet das Modell mit einem Aufruf einer dieser Funktionen, etwa einer Datenbankabfrage, statt zu raten. Das Modell führt selbst nie etwas aus: Deine App führt die Funktion aus und sendet das Ergebnis zurück, und das Modell schreibt dann die endgültige Antwort.

\`\`\`bash
curl https://api.phaseo.app/v1/chat/completions \\
  -H "Authorization: Bearer $PHASEO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-6-astra",
    "messages": [
      { "role": "user", "content": "What is the weather in London?" }
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_weather",
          "description": "Get current weather by city",
          "parameters": {
            "type": "object",
            "properties": {
              "city": { "type": "string" }
            },
            "required": ["city"]
          }
        }
      }
    ]
  }'
\`\`\`

Bei Chat Completions hat die Antwort \`finish_reason: "tool_calls"\` und eine Liste \`tool_calls\` an der Assistant-Nachricht, jeweils mit einer \`id\`, einem Funktionsnamen \`name\` und \`arguments\` als JSON-String. Führe jeden Aufruf aus und sende dann eine Folgeanfrage, die die Unterhaltung wiederholt, die Assistant-Nachricht unverändert enthält und pro Aufruf eine Nachricht mit \`role: "tool"\`, zugeordnet über \`tool_call_id\`. Sende \`tools\` erneut mit. Das Modell antwortet dann oder ruft ein weiteres Tool auf, und du wiederholst den Ablauf. Bei \`/v1/responses\` ist der Aufruf ein Element \`function_call\` und dein Ergebnis ein Element \`function_call_output\` mit derselben \`call_id\`; bei \`/v1/messages\` sind es die Blöcke \`tool_use\` und \`tool_result\`.

\`tool_choice\` steuert, ob das Modell Tools aufrufen darf: \`none\` nur für Text, \`auto\` (oder weglassen), damit das Modell entscheidet, \`required\`, um einen Aufruf zu erzwingen, oder ein Objekt, das ein bestimmtes Tool nennt. Setze \`parallel_tool_calls\` auf \`false\`, wenn deine Tools nacheinander laufen müssen.

Behandle jeden Aufruf als nicht vertrauenswürdige Eingabe. Prüfe den Tool-Namen gegen eine Zulassungsliste, lehne unbekannte Namen ab und validiere die geparsten Argumente, bevor etwas läuft. Schlägt die Validierung fehl, führe das Tool nicht aus: Sende einen kurzen Fehler als Tool-Ergebnis und lass das Modell es erneut versuchen. Mit \`stream: true\` sammelst du alle Argument-Deltas, bevor du parst. Tools, deren Typ mit \`phaseo:\` beginnt, etwa \`phaseo:web_search\` oder \`phaseo:datetime\`, laufen bei Phaseo, sodass du die endgültige Antwort bekommst, ohne selbst einen Executor zu schreiben. Diese Server-Tools sind in der **Beta**.`,
			quiz: {
				question: "Das Modell gibt einen Aufruf von `delete_user` mit `{\"id\": \"42\"}` zurück. Deine App definiert nur `get_weather`. Was sollte dein Code tun?",
				options: [
					"Ihn ausführen, weil das Modell ihn aus der Unterhaltung heraus gewählt hat",
					"Ihn als unbekanntes Tool ablehnen und einen kurzen Fehler als Tool-Ergebnis zurücksenden",
					"Phaseo bitten, ihn mit einem Präfix `phaseo:` auszuführen",
				],
				answer: 1,
				explanation:
					"Der Sicherheitsleitfaden sagt, unbekannte Tool-Namen abzulehnen, statt zu raten, was das Modell gemeint hat, und einen kontrollierten Fehler zurückzusenden, statt etwas auszuführen. `phaseo:`-Tools sind ein fester Satz, den Phaseo bereitstellt, kein Weg, deine eigenen Funktionen auszuführen.",
			},
			scenario: {
				prompt:
					"Dein Support-Bot ruft `get_order` auf und antwortet dann. Die Schleife eines Kollegen sendet in der Folgeanfrage nur die Nachricht mit `role: \"tool\"`, und der Anbieter lehnt sie ab. Was fehlt?",
				answer:
					"Die Folgeanfrage muss die Unterhaltung wiederholen, dann die Assistant-Nachricht mit ihren `tool_calls` unverändert, dann pro Aufruf eine Nachricht mit `role: \"tool\"` und der passenden `tool_call_id`. Sende auch `tools` erneut mit. Ein Tool-Ergebnis ohne vorherigen Aufruf hat nichts, dem es zugeordnet werden kann.",
			},
			takeaway:
				"Das Modell fragt, deine App validiert und führt den Aufruf aus, und du sendest das Ergebnis mit der ID des Aufrufs zurück, bis das Modell eine endgültige Antwort gibt.",
			links: [
				{ label: "Tool-Aufrufe", href: "https://phaseo.app/docs/v1/guides/tool-calling" },
				{ label: "Muster für Tool-Aufrufe", href: "https://phaseo.app/docs/v1/guides/tool-calling-patterns" },
				{ label: "Sicherheit bei Tool-Aufrufen", href: "https://phaseo.app/docs/v1/guides/tool-calling-safety" },
				{ label: "Server-Tools", href: "https://phaseo.app/docs/v1/guides/server-tools" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "get-structured-output",
			title: "Strukturierte Ausgaben erhalten",
			summary: "Sende ein JSON Schema, damit das Modell JSON in deiner Form zurückgibt, und validiere es, bevor du es nutzt.",
			minutes: 8,
			body: `Sende ein JSON Schema mit der Anfrage, dann gibt das Modell JSON in dieser Form statt freiem Text zurück. Nutze das, wenn du Daten zurückhaben willst, etwa Felder aus einer E-Mail. Nutze Tool-Aufrufe, wenn das Modell deine App bitten soll, etwas zu tun.

| \`type\` | Was du bekommst |
| --- | --- |
| \`json_schema\` | JSON, das deinem Schema folgt. Nutze das standardmäßig. |
| \`json_object\` | Irgendein gültiges JSON-Objekt, ohne erzwungene Form. |
| \`text\` | Reinen Text (der Standard). |

Das Format gehört in \`response_format\` bei \`/v1/chat/completions\`, in \`text.format\` bei \`/v1/responses\` und in \`output_config.format\` bei \`/v1/messages\` (nur \`json_schema\`).

\`\`\`json
{
  "model": "openai/gpt-6-astra",
  "messages": [
    { "role": "user", "content": "Return the city and weather for London." }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "weather",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "city": { "type": "string" },
          "weather": { "type": "string" }
        },
        "required": ["city", "weather"],
        "additionalProperties": false
      }
    }
  }
}
\`\`\`

Das JSON kommt als String im Nachrichteninhalt zurück. Bevor du es parst, prüfe auf eine Ablehnung, fehlenden Inhalt oder ein \`finish_reason\` außer \`stop\`. Validiere dann das geparste Objekt, zum Beispiel mit Zod. Schlägt die Validierung fehl, versuche es einmal mit dem Fehler im Prompt erneut und gib dann einen sicheren Fehler zurück. Jede Wiederholung kostet, und gültiges JSON beweist noch nicht, dass die Werte stimmen.

Phaseo verwirft \`response_format\` nie. Es routet eine \`json_schema\`-Anfrage nur an Anbieter, die strukturierte Ausgaben unterstützen; unterstützt keiner der Anbieter des Modells sie, schlägt die Anfrage mit \`400 validation_error\` fehl. Modellseiten kennzeichnen die Unterstützung mit \`structured_outputs\`; das ist ein Funktionsmerkmal, kein Anfragefeld.`,
			quiz: {
				question: "Du sendest `response_format` mit `json_schema` an ein Modell, dessen Anbieter keine strukturierten Ausgaben unterstützen. Was passiert?",
				options: [
					"Phaseo verwirft `response_format` und gibt reinen Text zurück",
					"Phaseo sendet die Anfrage trotzdem, und das Modell rät die Form",
					"Die Anfrage schlägt mit `400 validation_error` fehl",
				],
				answer: 2,
				explanation:
					"`response_format` wird nie verworfen. Phaseo routet eine Schema-Anfrage nur an Anbieter, die strukturierte Ausgaben unterstützen, und gibt einen 400 zurück, wenn das Modell keinen solchen hat.",
			},
			scenario: {
				prompt:
					"Dein Rechnungsparser nutzt `json_schema`, und hin und wieder scheitert die Antwort an deiner Zod-Prüfung, weil `total` fehlt. Was sollte der Code tun?",
				answer:
					"Prüfe zuerst, dass `finish_reason` gleich `stop` ist, denn eine abgeschnittene Antwort kann nicht gültig sein. Versuche es dann einmal mit dem Validierungsfehler im Prompt erneut, und wenn es wieder scheitert, gib einen sicheren Fehler zurück, statt zu raten. Erfasse Fehlschläge pro Modell und Schema-Version, damit du merkst, wenn eine Änderung an einem von beiden die Lage verschlechtert.",
			},
			takeaway:
				"Nutze `json_schema` für Daten, die du in einer festen Form brauchst, und validiere das Ergebnis immer in deinem eigenen Code, bevor du ihm vertraust.",
			links: [
				{ label: "Strukturierte Ausgaben", href: "https://phaseo.app/docs/v1/guides/structured-outputs" },
				{ label: "Parameter: response_format", href: "https://phaseo.app/docs/v1/api-reference/parameters" },
				{ label: "Response Healing für JSON", href: "https://phaseo.app/docs/v1/cookbook/response-healing-for-structured-json" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "send-images-and-audio",
			title: "Bilder und Audio senden",
			summary: "Füge einer Anfrage Bilder, Dateien und Audio hinzu, wähle den Endpunkt für die gewünschte Ausgabe und finde Modelle, die jede Eingabe annehmen.",
			minutes: 9,
			body: `Auf den Text-Endpunkten kann der \`content\` einer Nachricht statt eines Strings eine Liste von Teilen sein. Ein Bildteil nimmt eine HTTP(S)-URL oder eine Base64-\`data:\`-URI:

\`\`\`json
{
  "model": "anthropic/claude-sonnet-5.5",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "What does this chart show?" },
        { "type": "image_url", "image_url": { "url": "https://example.com/chart.png" } }
      ]
    }
  ]
}
\`\`\`

Andere Eingabeteile folgen demselben Muster. \`input_audio\` sendet Base64-Audio in \`data\` mit einem \`format\` wie \`wav\` oder \`mp3\`. Ein Teil \`file\` sendet ein Dokument wie ein PDF, entweder als Base64-Data-URL in \`file_data\` oder als \`file_id\`. Eine \`file_id\` kann nur das Anbieterkonto lesen, das sie ausgestellt hat. Fixiere also diesen Anbieter oder sende stattdessen die Daten.

Für andere Arten von Ausgabe nutzt du den passenden Endpunkt:

| Du willst | Endpunkt |
| --- | --- |
| Sprache aus Text | \`/v1/audio/speech\` |
| Text aus Sprache | \`/v1/audio/transcriptions\` (\`/v1/audio/translations\` für Englisch) |
| Bilder | \`/v1/images/generations\`, \`/v1/images/edits\` |
| Text und Layout aus einem Dokumentbild | \`/v1/ocr\`, \`/v1/parse\` |

\`/v1/parse\` nimmt ein Bild pro Anfrage und akzeptiert keine PDFs. Wandle also zuerst jede Seite in ein Bild um.

Nicht jedes Modell nimmt jede Eingabe an. Phaseo routet nur an Anbieter, die die Eingaben in deiner Anfrage akzeptieren; tut das keiner, bekommst du \`400 unsupported_modalities\`. Prüfe das vorher: Jedes Modell in \`GET /v1/models\` listet \`modalities.input\`, und du kannst mit \`input_types=image\` filtern. Nutze auf der Seite [Modelle](https://phaseo.app/models) die Filter für Eingabe- und Ausgabemodalitäten.`,
			quiz: {
				question: "Du brauchst eine Liste der Modelle, die Bildeingaben annehmen. Was ist die schnellste zuverlässige Prüfung?",
				options: [
					"`GET /v1/models?input_types=image` aufrufen",
					"An jedes Modell ein Bild senden und schauen, welches keinen Fehler liefert",
					"Irgendein Modell nehmen, dessen Name \"vision\" enthält",
				],
				answer: 0,
				explanation:
					"`GET /v1/models` filtert nach `input_types` (Alias `input_modalities`), und jedes Modell listet `modalities.input`. Die Seite „Modelle“ hat dieselben Filter. Ausprobieren kostet Geld, und Namen verraten nicht, was eine Route annimmt.",
			},
			scenario: {
				prompt:
					"Deine Belegfunktion sendet ein Foto an ein reines Textmodell und bekommt `400 unsupported_modalities`. Die Produktmanagerin fragt, ob Phaseo ausgefallen ist. Was sagst du ihr, und was änderst du?",
				answer:
					"Phaseo ist nicht ausgefallen: Keine Route dieses Modells nimmt Bildeingaben an. Wähle ein Modell, dessen `modalities.input` den Wert `image` enthält (filtere `GET /v1/models` mit `input_types=image` oder nutze den Filter auf der Seite „Modelle“), und sende dieselbe Anfrage dorthin.",
			},
			takeaway:
				"Sende Bilder, Audio und Dateien als Inhaltsteile, nutze die eigenen Endpunkte für Sprache, Transkription und Bilder und prüfe die Eingabemodalitäten eines Modells, bevor du dich darauf verlässt.",
			links: [
				{ label: "Multimodalität", href: "https://phaseo.app/docs/v1/guides/multimodality" },
				{ label: "Modelle auflisten", href: "https://phaseo.app/docs/v1/api-reference/endpoint/models" },
				{ label: "Dokumentbilder parsen", href: "https://phaseo.app/docs/v1/guides/document-parsing" },
				{ label: "Modelle erkunden", href: "https://phaseo.app/docs/v1/exploring/models" },
			],
			updated: "2026-11-17",
		},
	],
};
