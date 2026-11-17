import type { LearnCourse } from "../../types";

export const firstRequestCourse: LearnCourse = {
	slug: "make-your-first-request",
	title: "Deine erste Anfrage senden",
	summary:
		"Sende eine Anfrage an die Phaseo API, lies, was zurückkommt, behandle Fehler und streame die Antwort.",
	level: "developer",
	format: "Jede Programmiersprache",
	prerequisites: ["Was ist Phaseo?", "Du kannst in einer beliebigen Sprache eine HTTP-Anfrage senden"],
	lessons: [
		{
			slug: "make-a-request",
			title: "Eine Anfrage senden",
			summary: "Sende deinen API-Schlüssel, eine Modell-ID und deine Eingabe an einen OpenAI-kompatiblen Endpunkt.",
			minutes: 7,
			body: `Jede Anfrage geht an \`https://api.phaseo.app/v1\` und trägt deinen API-Schlüssel als Bearer-Token: \`Authorization: Bearer phaseo_v1_sk_...\`. Erstelle den Schlüssel unter **Einstellungen → API-Schlüssel**. Er wird nur einmal angezeigt. Speichere ihn also in einer Umgebungsvariable wie \`PHASEO_API_KEY\` und nutze ihn nur in serverseitigem Code.

\`POST /v1/responses\` ist der empfohlene Endpunkt für neue Textaufgaben. Du sendest ein \`model\` und einen \`input\`:

\`\`\`bash
curl https://api.phaseo.app/v1/responses \\
  -H "Authorization: Bearer $PHASEO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-6-astra",
    "input": "Reply with: quickstart works"
  }'
\`\`\`

Du nutzt schon das offizielle OpenAI SDK? Dann änderst du drei Dinge: den API-Schlüssel, die Basis-URL und die Modell-ID.

\`\`\`ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.PHASEO_API_KEY,
  baseURL: "https://api.phaseo.app/v1",
});

const response = await client.responses.create({
  model: "openai/gpt-6-astra",
  input: "Write one sentence about reliable model routing.",
});

console.log(response.output_text);
\`\`\`

Code, der Chat Completions aufruft, funktioniert mit demselben Client: Sende stattdessen \`messages\` an \`client.chat.completions.create\`.

Modell-IDs tragen immer das Anbieterpräfix, etwa \`openai/\`, \`anthropic/\` oder \`google/\`. Um das Modell zu wechseln, änderst du nur den String in \`model\`; der Rest der Anfrage bleibt gleich. Liste gültige IDs mit \`GET /v1/models\` auf, statt zu raten. \`phaseo/free\` wählt ein verfügbares kostenloses Modell und funktioniert ohne Credits, was es praktisch für einen ersten Test macht.`,
			quiz: {
				question: "Du richtest das offizielle OpenAI SDK auf Phaseo aus. Welche Änderungen brauchst du?",
				options: [
					"Den API-Schlüssel, die Basis-URL und die Modell-ID",
					"Nur die Basis-URL; das SDK nutzt weiter deinen OpenAI-Schlüssel",
					"Ein Phaseo-eigenes Anfragefeld, das den Anbieter nennt, plus die Basis-URL",
				],
				answer: 0,
				explanation:
					"Die Dokumentation nennt genau drei Änderungen: deinen Phaseo-API-Schlüssel, die Basis-URL https://api.phaseo.app/v1 und eine Phaseo-Modell-ID mit Anbieterpräfix. Dein OpenAI-Schlüssel funktioniert bei Phaseo nicht, und der Anbieter ist Teil der Modell-ID, kein eigenes Feld.",
			},
			scenario: {
				prompt:
					"Deine App sendet `\"model\": \"gpt-6-astra\"`, und die Anfrage schlägt mit 400 fehl. Ein Kollege meint, das Modell sei ausgefallen. Was prüfst du zuerst?",
				answer:
					"Die Modell-ID. Phaseo-Modell-IDs enthalten das Anbieterpräfix, sie sollte also `openai/gpt-6-astra` lauten. Ein 400 weist auf den Anfragetext oder die Modell-ID hin, nicht auf einen Ausfall. Rufe `GET /v1/models` auf, um die genaue ID zu bestätigen.",
			},
			takeaway:
				"Eine Basis-URL, ein Bearer-Schlüssel und eine Modell-ID mit Anbieterpräfix reichen, und ein Modellwechsel bedeutet, einen String zu ändern.",
			links: [
				{ label: "Schnellstart", href: "https://phaseo.app/docs/v1/quickstart" },
				{ label: "OpenAI SDK", href: "https://phaseo.app/docs/v1/guides/integrations/openai-sdk" },
				{ label: "Chat Completion erstellen", href: "https://phaseo.app/docs/v1/api-reference/endpoint/chat-completions" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "read-the-response",
			title: "Die Antwort lesen",
			summary: "Finde die Antwort, den Grund, warum sie endete, wer sie bedient hat und was sie gekostet hat.",
			minutes: 6,
			body: `Eine Chat-Completions-Antwort sieht so aus (Werte zur Veranschaulichung):

\`\`\`json
{
  "id": "G-...",
  "object": "chat.completion",
  "model": "openai/gpt-6-astra",
  "provider": "openai",
  "choices": [
    {
      "index": 0,
      "message": { "role": "assistant", "content": "ok" },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 1,
    "total_tokens": 13,
    "cost": 0.000021
  }
}
\`\`\`

- **\`choices[].message.content\`** enthält den Antworttext.
- **\`finish_reason\`** sagt, warum das Modell aufgehört hat: \`stop\` (es ist fertig), \`length\` (es hat das Tokenlimit erreicht), \`tool_calls\` (es will ein Tool aufrufen) oder \`content_filter\`.
- **\`model\`** nennt das Modell, das geantwortet hat. Hat ein Fallback-Modell die Anfrage bedient, steht hier das Fallback, nicht das Modell, das du angefragt hast.
- **\`provider\`** nennt den Anbieter, der die Anfrage bedient hat.
- **\`id\`** ist die Phaseo-Anfrage-ID. Protokolliere sie: Die Anfrage erscheint unter **Einstellungen → Nutzung → Protokolle**, und der Support fragt danach.

\`usage\` zählt Tokens und ergänzt \`cost\`: was dich die Anfrage in US-Dollar kostet, also der Betrag, der von deinen Credits abgezogen wird. Bei einer BYOK-Anfrage zeigt \`cost_details.upstream_inference_cost\`, was deinem eigenen Anbieterschlüssel berechnet wird; bei Phaseo-Credits ist es \`null\`.

Bei \`/v1/responses\` sieht die Form anders aus: Der Text steht in \`output[].content[]\`, wo \`type\` gleich \`output_text\` ist, und \`usage\` nutzt \`input_tokens\` und \`output_tokens\`.`,
			quiz: {
				question: "Eine Chat-Completions-Antwort kommt mit `finish_reason: \"length\"` zurück. Was ist passiert?",
				options: [
					"Der Anbieter ist mittendrin ausgefallen, und Phaseo hat zurückgegeben, was es hatte",
					"Das Modell hat das Tokenlimit erreicht, die Antwort ist also eventuell abgeschnitten",
					"Das Modell ist normal fertig geworden, und die Antwort ist vollständig",
				],
				answer: 1,
				explanation:
					"`length` bedeutet, dass das Modell aufgehört hat, weil es das Tokenlimit erreicht hat. Ein normales Ende ist `stop`. Ein Anbieter, der mittendrin ausfällt, gibt einen Fehler zurück, keine Teilantwort mit Endgrund.",
			},
			scenario: {
				prompt:
					"Die Buchhaltung fragt, was die gestrige Anfrage `G-01J...` gekostet hat und welcher Anbieter sie ausgeführt hat. Wo schaust du nach?",
				answer:
					"In der Antwort selbst: `usage.cost` nennt die Kosten in US-Dollar, und `provider` nennt, wer sie bedient hat. Wenn du den Antworttext nicht protokolliert hast, öffne die Anfrage über ihre ID unter **Einstellungen → Nutzung → Protokolle**.",
			},
			takeaway:
				"Lies die Antwort aus `choices`, prüfe `finish_reason` und protokolliere bei jedem Aufruf `id`, `model`, `provider` und `usage.cost`.",
			links: [
				{ label: "Chat Completion erstellen", href: "https://phaseo.app/docs/v1/api-reference/endpoint/chat-completions" },
				{ label: "Response erstellen", href: "https://phaseo.app/docs/v1/api-reference/endpoint/responses" },
				{ label: "Schnellstart: die Antwort lesen", href: "https://phaseo.app/docs/v1/quickstart" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "when-a-request-fails",
			title: "Wenn eine Anfrage fehlschlägt",
			summary: "Verzweige nach Fehlercode und Status und wiederhole nur die Fehler, die später gelingen können.",
			minutes: 8,
			body: `Jeder Phaseo-Fehler hat auf jedem Endpunkt denselben JSON-Body. Das Objekt \`error\` hat die Form, die OpenAI-kompatible SDKs schon lesen:

\`\`\`json
{
  "error": {
    "code": "insufficient_funds",
    "message": "...",
    "type": "insufficient_quota",
    "param": null
  },
  "generation_id": "G-...",
  "status_code": 402
}
\`\`\`

Verzweige nach \`error.code\` und dem HTTP-Status, nie nach dem Meldungstext. Protokolliere immer \`generation_id\`.

| Status | Häufiger Code | Was zu tun ist |
| --- | --- | --- |
| \`400\` | \`validation_error\`, \`model_required\` | Korrigiere die Anfrage. \`error.param\` nennt das Feld. |
| \`401\` | \`unauthorised\` | Prüfe den Schlüssel und den Header \`Authorization\`. |
| \`402\` | \`insufficient_funds\` | Lade Credits auf oder nutze \`phaseo/free\`. |
| \`403\` | \`guardrail_blocked\` | Ändere die Anfrage oder die Guardrail. |
| \`404\` | \`not_found\` | Prüfe Pfad und ID. |
| \`410\` | \`model_retired\` | Wechsle zu \`replacement_model\`. |
| \`429\` | \`rate_limit_exceeded\`, \`key_limit_exceeded\` | Warte auf \`Retry-After\` und versuche es dann erneut. |
| \`5xx\` | \`upstream_error\`, \`gateway_error\` | Wiederhole mit Backoff. |

Wiederhole \`4xx\`-Fehler außer \`429\` nicht unverändert: Sie schlagen erneut fehl. Bei \`429\` wartest du auf \`Retry-After\` (Sekunden oder ein HTTP-Datum) oder nutzt exponentielles Backoff mit Jitter. Ein \`key_limit_exceeded\` ohne \`Retry-After\` setzt sich nicht von selbst zurück, also wiederhole ihn nicht. Wiederhole \`5xx\` nur, wenn ein erneuter Aufruf sicher ist, und setze eine Obergrenze für Versuche und eine Gesamtfrist.`,
			quiz: {
				question: "Deine Anfrage gibt `401` mit dem Code `unauthorised` zurück. Was sollte dein Code tun?",
				options: [
					"Anhalten und den API-Schlüssel sowie den Header `Authorization: Bearer` prüfen",
					"Mit exponentiellem Backoff wiederholen, bis es klappt",
					"Auf den Header `Retry-After` warten und dann dieselbe Anfrage erneut senden",
				],
				answer: 0,
				explanation:
					"Ein 401 bedeutet, dass der Schlüssel fehlt oder ungültig ist. Dieselbe Anfrage zu wiederholen, ändert daran nichts. Backoff ist für 429 und 5xx gedacht, und `Retry-After` kommt mit 429-Antworten.",
			},
			scenario: {
				prompt:
					"Ein Batch-Skript sendet 500 Anfragen in einer Schleife. Nach der Hälfte kommen Antworten als `429` mit dem Header `Retry-After: 20` zurück. Was änderst du?",
				answer:
					"Lass das Skript `Retry-After` beachten: Es wartet etwa 20 Sekunden, bevor es erneut versucht, und nutzt exponentielles Backoff mit Jitter, wenn der Header fehlt. Prüfe auch `error.code`: `rate_limit_exceeded` setzt sich zurück, ein `key_limit_exceeded` ohne `Retry-After` aber nicht, Wiederholen ist dann also sinnlos.",
			},
			takeaway:
				"Verzweige nach `error.code` und Status, behebe 4xx-Fehler und wiederhole nur 429 und sichere 5xx-Fehler mit Backoff.",
			links: [
				{ label: "Fehler und Debugging", href: "https://phaseo.app/docs/v1/api-reference/errors" },
				{ label: "Ratenlimits", href: "https://phaseo.app/docs/v1/api-reference/limits" },
				{ label: "Schnellstart: Fehlerbehebung", href: "https://phaseo.app/docs/v1/quickstart" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "stream-it",
			title: "Streamen",
			summary: "Zeige die Antwort, während sie geschrieben wird, und unterscheide einen fertigen Stream von einem abgebrochenen.",
			minutes: 9,
			body: `Setze \`"stream": true\`, dann sendet Phaseo die Ausgabe als Server-Sent Events (SSE), während das Modell sie schreibt:

\`\`\`bash
curl --no-buffer https://api.phaseo.app/v1/responses \\
  -H "Authorization: Bearer $PHASEO_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "openai/gpt-6-astra",
    "input": "Say hello in one sentence.",
    "stream": true
  }'
\`\`\`

Prüfe zuerst den HTTP-Status. Eine Anfrage, die vor dem Start des Streams fehlschlägt, bekommt den normalen JSON-Fehler, keinen Stream. Lies dann die Events. Jeder Endpunkt hat sein eigenes Format:

| Endpunkt | Text kommt in | Erfolgreiches Ende | Ende bei Fehler |
| --- | --- | --- | --- |
| Responses | \`response.output_text.delta\` | \`response.completed\` | \`response.failed\` oder \`error\` |
| Chat Completions | \`choices[].delta\` | ein \`finish_reason\`, dann \`[DONE]\` | ein \`error\`-Frame ohne \`finish_reason\` |

Bei Chat Completions trägt vor \`[DONE]\` ein letzter Chunk mit leerem \`choices\` die \`usage\`, einschließlich \`cost\` für den ganzen Stream. Nur Chat Completions sendet \`[DONE]\`. Ein Netzwerk-Chunk kann ein halbes Event oder mehrere enthalten. Puffere also, bis ein Event vollständig ist, bevor du es parst, oder nutze einen Stream-Helper eines SDK.

Ein Stream ist erst fertig, wenn sein erfolgreiches End-Event ankommt. Eine geschlossene Verbindung allein heißt nicht, dass die Antwort vollständig ist. Bricht er mittendrin ab, behalte den Teiltext als unterbrochen markiert und biete eine Wiederholung an; Phaseo berechnet die Teilausgabe eines fehlgeschlagenen Streams nicht.

Zum Abbrechen übergibst du ein \`AbortSignal\` (oder das Gegenstück deines HTTP-Clients) und brichst ab, wenn die Person stoppt. Ein Abbruch garantiert nicht, dass der Anbieter sofort aufhört oder dass bereits generierte Ausgabe kostenlos ist.`,
			quiz: {
				question: "Dein Chat-Completions-Stream hat Text geliefert, dann schließt sich die Verbindung. Du hast weder ein `finish_reason` noch `[DONE]` gesehen. Was tust du?",
				options: [
					"Sie als vollständig behandeln, weil sich die Verbindung sauber geschlossen hat",
					"Die nächste, wiederholte Antwort an den Teiltext anhängen",
					"Die Antwort als unterbrochen behandeln und eine Wiederholung anbieten",
				],
				answer: 2,
				explanation:
					"Ein Stream ist erst fertig, wenn sein erfolgreiches End-Event ankommt. Ohne `finish_reason` und `[DONE]` ist die Antwort unvollständig. Eine Wiederholung kann einen anderen Text erzeugen, zeige ihn also für sich, statt ihn anzuhängen.",
			},
			scenario: {
				prompt:
					"In deiner Chat-Oberfläche können Nutzer auf **Stopp** drücken. Deine Produktmanagerin nimmt an, dass gestoppte Antworten nichts kosten. Stimmt das?",
				answer:
					"Nein. Brich die Anfrage mit einem `AbortSignal` ab, damit deine App aufhört zu lesen. Laut Dokumentation garantiert ein Abbruch aber nicht, dass der Anbieter sofort aufhört oder dass bereits generierte Ausgabe kostenlos ist. Rechne damit, dass für gestoppte Antworten die bereits geleistete Arbeit berechnet wird.",
			},
			takeaway:
				"Warte auf das erfolgreiche End-Event des Endpunkts, behandle alles andere als unterbrochen und geh nicht davon aus, dass ein abgebrochener Stream kostenlos ist.",
			links: [
				{ label: "Streaming", href: "https://phaseo.app/docs/v1/guides/streaming" },
				{ label: "Fehler während eines Streams", href: "https://phaseo.app/docs/v1/api-reference/errors" },
				{ label: "Response erstellen", href: "https://phaseo.app/docs/v1/api-reference/endpoint/responses" },
			],
			updated: "2026-11-17",
		},
	],
};
