import type { LearnCourse } from "../../types";

export const foundationsCourse: LearnCourse = {
	slug: "what-is-phaseo",
	title: "Was ist Phaseo?",
	summary:
		"Lerne, was Phaseo macht, richte dein Konto und deinen ersten API-Schlüssel ein, finde die Dashboard-Seiten, die du am häufigsten brauchst, und wähle ein Modell.",
	level: "beginner",
	format: "Ohne Code",
	prerequisites: [],
	lessons: [
		{
			slug: "what-phaseo-is",
			title: "Was Phaseo ist",
			summary:
				"Phaseo ist ein Gateway: eine API und ein Schlüssel vor vielen Modellen und den Anbietern, die sie hosten.",
			minutes: 6,
			body: `Phaseo ist ein AI-Gateway. Du sendest jede Anfrage an eine API, \`https://api.phaseo.app/v1\`, mit einem Schlüssel. Phaseo gibt jede Anfrage an einen Anbieter weiter, der sie bedienen kann, und rechnet sie über deinen Workspace ab. Du kannst die Form der Responses-, Chat-Completions- oder Messages-API nutzen, je nachdem, welche deine App schon spricht.

**Modelle und Anbieter sind zwei verschiedene Dinge.** Ein Modell ist das System, das die Antwort schreibt. Ein Anbieter hostet das Modell und legt Preis, Geschwindigkeit, Verfügbarkeit und unterstützte Parameter fest. Ein Modell kann mehrere Anbieter haben.

**Eine Modell-ID benennt das Modell, nicht den Anbieter.** IDs sehen aus wie \`openai/gpt-6-astra\` oder \`anthropic/claude-sonnet-5.5\`: zuerst das Labor, dann das Modell. \`phaseo/free\` wählt ein verfügbares kostenloses Modell und funktioniert ohne Credits. Wenn du genau einen bestimmten Anbieter brauchst, kannst du ihn vor die ID setzen, zum Beispiel \`baseten:thinking-machines/inkling-small\`.

**So wird eine Anfrage geroutet:**

1. Phaseo behält nur die Anbieter, die deine Workspace-Einstellungen und deine Anfrage erlauben.
2. Es reiht sie. Der Standardmodus \`balanced\` wägt Preis, Geschwindigkeit und Zuverlässigkeit ab.
3. Es ruft den besten Anbieter auf. Schlägt dieser fehl, versucht es den nächsten.
4. Schlagen alle Anbieter mit einem wiederholbaren Fehler fehl und hast du in \`models\` Fallback-Modelle angegeben, versucht es das nächste Modell.

Fallbacks garantieren keinen Erfolg. Deine App sollte \`429\`- und \`5xx\`-Fehler deshalb trotzdem mit Backoff wiederholen. Noch etwas: Der öffentliche Katalog listet auch Modelle, die sich noch nicht aufrufen lassen. Prüfe, dass ein Modell **Auf Gateway aktiv** ist, bevor du seine ID verwendest.`,
			quiz: {
				question:
					"Du rufst ein Modell auf, das drei Anbieter hosten, und der bestplatzierte Anbieter gibt einen Fehler zurück. Was macht Phaseo als Nächstes?",
				options: [
					"Es versucht den nächsten geeigneten Anbieter für dasselbe Modell.",
					"Es gibt den Fehler sofort zurück, weil du diesen Anbieter gewählt hast.",
					"Es wechselt zu einem anderen Modell, das es für dich auswählt.",
				],
				answer: 0,
				explanation:
					"Wenn ein Anbieter fehlschlägt, versucht das Gateway den nächsten geeigneten Anbieter für dasselbe Modell. Zu einem anderen Modell wechselt es nur, wenn du in `models` Fallback-Modelle angegeben hast und jeder Anbieter mit einem wiederholbaren Fehler fehlgeschlagen ist.",
			},
			scenario: {
				prompt:
					"Eine Kollegin hat auf der Seite „Modelle“ von Phaseo ein Modell gefunden und seine ID in eine Anfrage kopiert. Die Anfrage schlägt fehl, aber die Modellseite sieht gut aus. Was ist der wahrscheinlichste Grund, und wie prüfst du ihn?",
				answer:
					"Der Katalog listet mehr Modelle, als das Gateway aufrufen kann. Das Modell ist vielleicht „Demnächst verfügbar“ oder „Inaktiv“. Auf der Seite „Modelle“ zeigt der Filter „Gateway-Status“ standardmäßig Modelle, die auf dem Gateway aktiv sind, und `GET /v1/models` gibt nur Modelle zurück, die du aufrufen kannst. Wähle ein Modell, das auf dem Gateway aktiv ist.",
			},
			takeaway:
				"Du wählst das Modell; Phaseo wählt einen Anbieter, der es hostet, und weicht auf einen anderen aus, wenn einer fehlschlägt.",
			links: [
				{
					label: "So funktioniert Phaseo",
					href: "https://phaseo.app/docs/v1/developers/introduction",
				},
				{
					label: "Routing und Fallbacks",
					href: "https://phaseo.app/docs/v1/guides/routing-and-fallbacks",
				},
				{
					label: "Modelle erkunden",
					href: "https://phaseo.app/docs/v1/exploring/models",
				},
			],
			updated: "2026-11-17",
		},
		{
			slug: "create-an-account-and-key",
			title: "Konto und Schlüssel erstellen",
			summary:
				"Registriere dich, lerne, was einem Workspace gehört, und erstelle einen API-Schlüssel, den du aus deinem Code heraushältst.",
			minutes: 7,
			body: `Registriere dich auf phaseo.app mit Google, GitHub, GitLab oder mit E-Mail und Passwort. Jedes Konto startet mit einem persönlichen Workspace, und der reicht für ein kleines Projekt.

**Einem Workspace gehören die Dinge.** Er enthält deine API-Schlüssel, Routing-Einstellungen, Voreinstellungen, Guardrails und legt fest, wer Admin-Zugang hat. Kostenpflichtige Anfragen nutzen das Credit-Guthaben des Workspace. Nach deiner ersten Credit-Einzahlung kannst du weitere Workspaces anlegen, zum Beispiel einen pro Produkt oder pro Umgebung. Zusätzliche Workspaces ändern deine Preise nicht.

**Erstelle einen Schlüssel** unter **Einstellungen → API-Schlüssel** und wähle **Schlüssel erstellen**. Wähle den Workspace, gib dem Schlüssel einen Namen und wähle eine Vorlage:

- **Entwicklung**: eine niedrige tägliche Ausgabenobergrenze für lokale Apps und Prototypen.
- **Produktion**: keine voreingestellten Limits. Füge bei Bedarf später welche hinzu.
- **CI**: ein Anfragelimit für Tests, Evaluierungen und Release-Aufgaben.
- **Testumgebung**: ein enges Limit für Demos, Testphasen und gemeinsame Experimente.

Schlüssel können tägliche, wöchentliche oder monatliche Limits für Anfragen und Ausgaben haben. Ist ein Limit erreicht, geben Anfragen mit diesem Schlüssel \`429\` mit \`key_limit_exceeded\` zurück.

**Der Schlüssel wird nur einmal angezeigt.** Kopiere ihn und speichere ihn als Umgebungsvariable:

\`\`\`bash
export PHASEO_API_KEY="phaseo_v1_sk_..."
\`\`\`

Behandle ihn wie ein Passwort. Lies ihn in serverseitigem Code aus \`PHASEO_API_KEY\`. Schreib ihn nie in deinen Code, in ein Repository, in eine Browser- oder Mobile-App oder in einen Chat mit einer Person oder einem Agenten. Nutze einen Schlüssel pro App und Umgebung, damit du einen ersetzen kannst, ohne die anderen zu stören, und lösche Schlüssel, die du nicht mehr brauchst.`,
			quiz: {
				question: "Wo sollte dein Phaseo-API-Schlüssel liegen?",
				options: [
					"In der Umgebungsvariable PHASEO_API_KEY, gelesen von serverseitigem Code.",
					"In deinem Frontend-Code, damit der Browser Phaseo direkt aufrufen kann.",
					"In einer Chatnachricht an deinen Coding-Agenten, damit er die Einrichtung für dich abschließt.",
				],
				answer: 0,
				explanation:
					"Laut Dokumentation gehören Schlüssel in serverseitigen Code und nicht in Browser, Mobile-Apps, Repositorys oder Chats. Wer den Schlüssel hat, kann die Credits deines Workspace ausgeben.",
			},
			scenario: {
				prompt:
					"Du baust einen Prototyp, der ein kostenpflichtiges Modell in einer Schleife aufruft. Du befürchtest, dass ein Fehler über Nacht hohe Kosten verursacht. Was kannst du beim Erstellen des Schlüssels tun?",
				answer:
					"Wähle die Vorlage „Entwicklung“ oder „Testumgebung“, die eine niedrige Ausgabenobergrenze setzen, oder setze ein tägliches Ausgabenlimit für den Schlüssel. Erreicht die Schleife das Limit, geben Anfragen 429 mit key_limit_exceeded zurück, statt weiter Geld auszugeben. Nutze für die Produktion einen eigenen Schlüssel.",
			},
			takeaway:
				"Deinem Workspace gehören Schlüssel und Credits; erstelle einen Schlüssel pro App und Umgebung und halte ihn auf dem Server in PHASEO_API_KEY.",
			links: [
				{
					label: "Schnellstart",
					href: "https://phaseo.app/docs/v1/quickstart",
				},
				{
					label: "Authentifizierung",
					href: "https://phaseo.app/docs/v1/developers/authentication",
				},
				{
					label: "Workspaces",
					href: "https://phaseo.app/docs/v1/guides/workspaces",
				},
				{ label: "API-Schlüssel", href: "/settings/keys" },
			],
			updated: "2026-11-17",
		},
		{
			slug: "find-your-way-around",
			title: "Dich zurechtfinden",
			summary:
				"Lerne die wenigen Seiten kennen, die du zuerst brauchst: Modelle, Schlüssel, Abrechnung, Nutzung, Protokolle und Workspace-Einstellungen.",
			minutes: 6,
			body: `Das Dashboard hat viele Seiten, aber für den Anfang brauchst du nur wenige. Die Seitenleiste der Einstellungen gruppiert sie in **Allgemein** (dein Konto und die Abrechnung), **Arbeitsbereich**, **Beobachten** und **Gateway**. Seiten in den letzten drei Gruppen gelten für den Workspace, der oben in der Kopfzeile ausgewählt ist. Prüfe ihn also, bevor du etwas änderst.

**Bevor du baust:**

- **Modelle** (\`/models\`): Durchsuche Modelle, filtere nach dem, was sie können, und öffne eines, um seine Anbieter, Preise und Leistung zu sehen. Ein Modell mit aktiver Route zeigt einen Schnellstart mit der ID, die du sendest. **Vergleichen** (\`/compare\`) stellt Modelle nebeneinander.
- **API-Schlüssel** (\`/settings/keys\`): Schlüssel erstellen, begrenzen und löschen. **Budgets** (\`/settings/budgets\`) begrenzt die Ausgaben des ganzen Workspace.

**Geld:**

- **Abrechnung → Abrechnung und Guthaben** (\`/settings/credits\`): dein Guthaben, die letzten Ausgaben und der Ort, an dem du Credits kaufst. Aufladungen im Dashboard beginnen bei $5, und Phaseo berechnet eine Gebühr von 5 % des Kaufbetrags, mindestens $1.
- **Abrechnung → Transaktionen** (\`/settings/credits/transactions\`) listet jeden Kauf.

**Nachdem du Anfragen gesendet hast:**

- **Nutzung** (\`/settings/usage/overview\`): wie dein Workspace Phaseo nutzt, mit den Seiten Übersicht, Trends, Erkunden und Warnungen.
- **Protokolle** (\`/settings/usage/logs/requests\`): eine Zeile pro Anfrage, mit Nutzung, Latenz, Kosten und Fehlern. Hier schaust du zuerst nach, wenn etwas fehlschlägt.

**Workspace-Einstellungen:** **Einstellungen** (\`/settings/workspaces/settings\`) für die allgemeinen Einstellungen und Mitglieder des Workspace, **Datenschutz** (\`/settings/privacy\`) für das, was gespeichert wird, und **Routing** (\`/settings/routing\`) dafür, wie Anbieter standardmäßig gereiht werden.`,
			quiz: {
				question:
					"Vor einer Stunde ist eine Anfrage fehlgeschlagen. Wo siehst du ihre Kosten, ihre Latenz und ihren Fehler?",
				options: [
					"In den Protokollen, unter „Beobachten“ in der Seitenleiste der Einstellungen.",
					"Unter Abrechnung → Transaktionen.",
					"Auf der Seite API-Schlüssel.",
				],
				answer: 0,
				explanation:
					"Anfrageprotokolle zeigen Nutzung, Latenz, Kosten und Fehler jeder Anfrage. Transaktionen listet nur Credit-Käufe, und auf der Seite API-Schlüssel verwaltest du Schlüssel.",
			},
			scenario: {
				prompt:
					"Dein Credit-Guthaben sinkt schneller als erwartet. Du willst herausfinden, warum, und verhindern, dass es wieder passiert. Welche Seiten öffnest du, in welcher Reihenfolge?",
				answer:
					"Beginne mit „Nutzung“, um zu sehen, wann die Ausgaben gestiegen sind. Öffne dann die Protokolle, um die einzelnen Anfragen dahinter anzusehen: welches Modell, wie viele Tokens, was jede gekostet hat. Wenn du die Ursache kennst, setze unter „API-Schlüssel“ ein Ausgabenlimit für den Schlüssel oder unter „Budgets“ ein Workspace-Budget.",
			},
			takeaway:
				"Modelle zum Auswählen, API-Schlüssel zum Verbinden, Abrechnung zum Bezahlen, und Nutzung und Protokolle, um zu sehen, was passiert ist.",
			links: [
				{ label: "Modelle", href: "/models" },
				{ label: "Anfrageprotokolle", href: "/settings/usage/logs/requests" },
				{
					label: "Preise und Abrechnung",
					href: "https://phaseo.app/docs/v1/pricing/tiers",
				},
				{
					label: "Schlüssellimits und Budgets",
					href: "https://phaseo.app/docs/v1/api-reference/limits",
				},
			],
			updated: "2026-11-17",
		},
		{
			slug: "choose-a-model",
			title: "Ein Modell wählen",
			summary:
				"Finde mit der Modellliste, den Modellseiten und „Vergleichen“ ein paar Kandidaten und teste sie mit deinen eigenen Beispielen, bevor du dich festlegst.",
			minutes: 8,
			body: `Beginne auf **Modelle** (\`/models\`). Standardmäßig zeigt die Seite nur Modelle, die **Auf Gateway aktiv** sind, also lässt sich alles aufrufen, was du siehst. Grenze die Liste mit Filtern ein: **Endpunkte** (etwa Textgenerierung oder Embeddings), **Eingabemodalitäten** und **Ausgabemodalitäten** (Text, Bild, Audio, Video), **Funktionen** (etwa Tool-Aufrufe oder Reasoning) und **Jahr**. Wenn du angemeldet bist, blendet **In meinem Workspace nutzbar** Modelle aus, die die Regeln deines Workspace blockieren. Du kannst nach Neuheit, Beliebtheit, Preis, Kontextlänge, Durchsatz oder Latenz sortieren.

**Öffne ein Modell, um zu sehen, was es bietet.** Seine Seite zeigt nur die Abschnitte, für die es Daten gibt:

- **Anbieter**: jede Anbieterroute mit Status, Kontextlänge, Preis, Verfügbarkeit, Datenrichtlinie und unterstützten Parametern.
- **Preise**: jeder Preisposten in USD. Textpreise gelten pro 1 Million Tokens, Eingabe und Ausgabe getrennt, dazu gecachte Eingabe, wenn ein Anbieter sie anbietet.
- **Leistung** und **Verfügbarkeit**: Latenz, Durchsatz und Erreichbarkeit, gemessen am Gateway-Traffic, sobald es genug davon gibt.
- **Vergleichstests**, **Über dieses Modell** (Veröffentlichungsdaten, Lizenz, Modellfamilie) und ein Schnellstart mit der Modell-ID, die du sendest.

**Wähle zwei oder drei Modelle in die engere Auswahl.** **Vergleichen** (\`/compare\`) stellt sie nach Preis, Benchmark-Ergebnissen, Kontext und Funktionen nebeneinander, und der **Preiskalkulator** (\`/tools/pricing-calculator\`) schätzt die Kosten einer typischen Anfrage. Benchmarks und Geschwindigkeitsdiagramme sind ein Ausgangspunkt, kein Urteil. Teste die engere Auswahl mit echten Beispielen aus deiner eigenen Arbeit: kurzen, typischen und langen. Probiere zuerst den günstigsten und schnellsten Kandidaten und steig nur dann auf ein teureres Modell um, wenn seine Antworten nicht gut genug sind. Für einen ersten Test ohne Credits sendest du \`phaseo/free\`; damit läuft deine Anfrage auf einem verfügbaren kostenlosen Modell (bis zu 1.500 Anfragen an kostenlose Modelle pro Nutzer und UTC-Tag).

**Modelle halten nicht ewig.** Labore kündigen Modelle ab und stellen sie ein, wenn neuere erscheinen. Ein eingestelltes Modell funktioniert weiter, solange noch ein Anbieter es bedient; danach schlagen Anfragen mit \`410 model_retired\` fehl. Die Modellseite zeigt das Abkündigungs- und das Einstellungsdatum sowie den vorgeschlagenen Ersatz. Phaseo zeigt einen Hinweis in deinem Dashboard, wenn ein Modell, das dein Workspace in den letzten 90 Tagen genutzt hat, innerhalb von 90 Tagen eingestellt wird, und **Einstellungen → Nutzung → Warnungen** listet jedes betroffene Modell. Teste den Ersatz, bevor du wechselst, denn neuere Modelle können auf denselben Prompt anders antworten.`,
			quiz: {
				question:
					"Zwei Modelle sehen in der Modellliste ähnlich aus. Eines kostet ein Viertel des anderen. Was solltest du zuerst tun?",
				options: [
					"Das teurere nehmen, weil ein höherer Preis bessere Antworten bedeutet.",
					"Ohne Test das Modell mit dem höheren Benchmark-Ergebnis nehmen.",
					"Das günstigere mit echten Beispielen aus deiner Arbeit testen und nur umsteigen, wenn seine Antworten nicht gut genug sind.",
				],
				answer: 2,
				explanation:
					"Preise und Benchmark-Ergebnisse helfen bei der engeren Auswahl, beweisen aber nicht, wie ein Modell mit deinen Prompts abschneidet. Wenn du zuerst das günstigere Modell mit deinen eigenen Beispielen testest, weißt du, ob du mehr zahlen musst.",
			},
			scenario: {
				prompt:
					"Ein Hinweis im Dashboard sagt, dass ein Modell, das dein Support-Bot nutzt, in 30 Tagen eingestellt wird. Was tust du?",
				answer:
					"Öffne Einstellungen → Nutzung → Warnungen, um das betroffene Modell, seine Daten und den vorgeschlagenen Ersatz zu sehen. Prüfe auf der Modellseite des Ersatzes Preis, Kontextlänge und unterstützte Parameter und teste ihn mit echten Supportfragen. Wenn du zufrieden bist, änderst du die Modell-ID in deiner App oder Voreinstellung, bevor kein Anbieter das alte Modell mehr bedient und Anfragen mit 410 fehlschlagen.",
			},
			takeaway:
				"Triff die Vorauswahl mit dem Katalog, entscheide mit deinen eigenen Beispielen und beginne mit dem günstigsten Modell, das die Aufgabe erfüllt.",
			links: [
				{ label: "Modelle", href: "/models" },
				{
					label: "Modelle erkunden",
					href: "https://phaseo.app/docs/v1/exploring/models",
				},
				{
					label: "Preise und Leistung",
					href: "https://phaseo.app/docs/v1/exploring/pricing-performance",
				},
				{
					label: "Einstellung von Modellen",
					href: "https://phaseo.app/docs/v1/guides/model-retirement",
				},
			],
			updated: "2026-11-17",
		},
	],
};
